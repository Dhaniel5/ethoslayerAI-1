UPDATE public.escrows e
SET pre_dispute_status = 'locked'::public.escrow_status
WHERE e.status IN ('disputed'::public.escrow_status, 'escalated'::public.escrow_status)
  AND e.pre_dispute_status IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.disputes d WHERE d.escrow_id = e.id
  );

INSERT INTO public.disputes (
  escrow_id,
  opened_by,
  opened_by_role,
  reason,
  status,
  escalated_at,
  last_activity_at,
  created_at,
  updated_at
)
SELECT
  e.id,
  e.user_id,
  'buyer',
  COALESCE(
    NULLIF(trim((
      SELECT ev.note
      FROM public.escrow_events ev
      WHERE ev.escrow_id = e.id
        AND ev.event_type = 'disputed'::public.escrow_event_type
      ORDER BY ev.created_at DESC
      LIMIT 1
    )), ''),
    'Legacy dispute migrated to the current resolution system.'
  ),
  CASE
    WHEN e.status = 'escalated'::public.escrow_status THEN 'escalated'::public.dispute_status
    ELSE 'open'::public.dispute_status
  END,
  CASE WHEN e.status = 'escalated'::public.escrow_status THEN COALESCE(e.disputed_at, now()) ELSE NULL END,
  COALESCE(e.disputed_at, e.updated_at, e.created_at, now()),
  COALESCE(e.disputed_at, e.updated_at, e.created_at, now()),
  now()
FROM public.escrows e
WHERE e.status IN ('disputed'::public.escrow_status, 'escalated'::public.escrow_status)
  AND NOT EXISTS (
    SELECT 1 FROM public.disputes d WHERE d.escrow_id = e.id
  );