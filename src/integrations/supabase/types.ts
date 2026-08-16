export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analysis_history: {
        Row: {
          analysis_data: Json | null
          analyzed_at: string
          governance_score: number | null
          id: string
          integrity_score: number | null
          manipulation_score: number | null
          mint_address: string
          token_name: string | null
          token_symbol: string | null
          user_id: string
        }
        Insert: {
          analysis_data?: Json | null
          analyzed_at?: string
          governance_score?: number | null
          id?: string
          integrity_score?: number | null
          manipulation_score?: number | null
          mint_address: string
          token_name?: string | null
          token_symbol?: string | null
          user_id: string
        }
        Update: {
          analysis_data?: Json | null
          analyzed_at?: string
          governance_score?: number | null
          id?: string
          integrity_score?: number | null
          manipulation_score?: number | null
          mint_address?: string
          token_name?: string | null
          token_symbol?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dispute_events: {
        Row: {
          actor_id: string | null
          actor_label: string | null
          created_at: string
          dispute_id: string
          event_type: string
          id: string
          note: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          dispute_id: string
          event_type: string
          id?: string
          note?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          dispute_id?: string
          event_type?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_events_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          created_at: string
          description: string | null
          dispute_id: string
          file_name: string | null
          id: string
          kind: string
          link_url: string | null
          storage_path: string | null
          submitted_by: string | null
          submitted_by_role: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          dispute_id: string
          file_name?: string | null
          id?: string
          kind: string
          link_url?: string | null
          storage_path?: string | null
          submitted_by?: string | null
          submitted_by_role: string
        }
        Update: {
          created_at?: string
          description?: string | null
          dispute_id?: string
          file_name?: string | null
          id?: string
          kind?: string
          link_url?: string | null
          storage_path?: string | null
          submitted_by?: string | null
          submitted_by_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_messages: {
        Row: {
          author_id: string | null
          author_role: string
          body: string
          created_at: string
          dispute_id: string
          id: string
        }
        Insert: {
          author_id?: string | null
          author_role: string
          body: string
          created_at?: string
          dispute_id: string
          id?: string
        }
        Update: {
          author_id?: string | null
          author_role?: string
          body?: string
          created_at?: string
          dispute_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_messages_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_notifications: {
        Row: {
          body: string | null
          created_at: string
          dispute_id: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dispute_id?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dispute_id?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_notifications_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_proposals: {
        Row: {
          amount_buyer: number
          amount_seller: number
          created_at: string
          dispute_id: string
          id: string
          kind: string
          note: string | null
          proposed_by: string
          proposed_by_role: string
          responded_at: string | null
          responded_by: string | null
          status: Database["public"]["Enums"]["proposal_status"]
        }
        Insert: {
          amount_buyer?: number
          amount_seller?: number
          created_at?: string
          dispute_id: string
          id?: string
          kind: string
          note?: string | null
          proposed_by: string
          proposed_by_role: string
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Update: {
          amount_buyer?: number
          amount_seller?: number
          created_at?: string
          dispute_id?: string
          id?: string
          kind?: string
          note?: string | null
          proposed_by?: string
          proposed_by_role?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_proposals_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          cancelled_at: string | null
          created_at: string
          escalated_at: string | null
          escrow_id: string
          id: string
          last_activity_at: string
          milestone_id: string | null
          opened_by: string
          opened_by_role: string
          reason: string
          ref: string
          resolution: Json | null
          resolution_tx: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          escalated_at?: string | null
          escrow_id: string
          id?: string
          last_activity_at?: string
          milestone_id?: string | null
          opened_by: string
          opened_by_role?: string
          reason: string
          ref?: string
          resolution?: Json | null
          resolution_tx?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          escalated_at?: string | null
          escrow_id?: string
          id?: string
          last_activity_at?: string
          milestone_id?: string | null
          opened_by?: string
          opened_by_role?: string
          reason?: string
          ref?: string
          resolution?: Json | null
          resolution_tx?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "escrows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "escrow_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_events: {
        Row: {
          amount_audd: number | null
          created_at: string
          escrow_id: string
          event_type: Database["public"]["Enums"]["escrow_event_type"]
          id: string
          note: string | null
          tx_signature: string | null
        }
        Insert: {
          amount_audd?: number | null
          created_at?: string
          escrow_id: string
          event_type: Database["public"]["Enums"]["escrow_event_type"]
          id?: string
          note?: string | null
          tx_signature?: string | null
        }
        Update: {
          amount_audd?: number | null
          created_at?: string
          escrow_id?: string
          event_type?: Database["public"]["Enums"]["escrow_event_type"]
          id?: string
          note?: string | null
          tx_signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escrow_events_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "escrows"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_milestones: {
        Row: {
          amount_audd: number
          approved: boolean
          approved_at: string | null
          created_at: string
          escrow_id: string
          id: string
          position: number
          title: string
        }
        Insert: {
          amount_audd: number
          approved?: boolean
          approved_at?: string | null
          created_at?: string
          escrow_id: string
          id?: string
          position?: number
          title: string
        }
        Update: {
          amount_audd?: number
          approved?: boolean
          approved_at?: string | null
          created_at?: string
          escrow_id?: string
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_milestones_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "escrows"
            referencedColumns: ["id"]
          },
        ]
      }
      escrows: {
        Row: {
          ai_analysis: Json | null
          amount_audd: number
          condition_type: string
          created_at: string
          description: string | null
          disputed_at: string | null
          expires_at: string | null
          id: string
          payee_accepted: boolean
          payee_accepted_at: string | null
          payee_requested_audd: boolean
          payee_user_id: string | null
          payee_wallet: string | null
          payer_wallet: string
          pre_dispute_status:
            | Database["public"]["Enums"]["escrow_status"]
            | null
          receiver_wallet: string
          released_at: string | null
          status: Database["public"]["Enums"]["escrow_status"]
          token_label: string | null
          token_mint: string | null
          trust_factors: Json | null
          trust_level: Database["public"]["Enums"]["trust_level"] | null
          trust_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          amount_audd: number
          condition_type?: string
          created_at?: string
          description?: string | null
          disputed_at?: string | null
          expires_at?: string | null
          id?: string
          payee_accepted?: boolean
          payee_accepted_at?: string | null
          payee_requested_audd?: boolean
          payee_user_id?: string | null
          payee_wallet?: string | null
          payer_wallet: string
          pre_dispute_status?:
            | Database["public"]["Enums"]["escrow_status"]
            | null
          receiver_wallet: string
          released_at?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          token_label?: string | null
          token_mint?: string | null
          trust_factors?: Json | null
          trust_level?: Database["public"]["Enums"]["trust_level"] | null
          trust_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          amount_audd?: number
          condition_type?: string
          created_at?: string
          description?: string | null
          disputed_at?: string | null
          expires_at?: string | null
          id?: string
          payee_accepted?: boolean
          payee_accepted_at?: string | null
          payee_requested_audd?: boolean
          payee_user_id?: string | null
          payee_wallet?: string | null
          payer_wallet?: string
          pre_dispute_status?:
            | Database["public"]["Enums"]["escrow_status"]
            | null
          receiver_wallet?: string
          released_at?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          token_label?: string | null
          token_mint?: string | null
          trust_factors?: Json | null
          trust_level?: Database["public"]["Enums"]["trust_level"] | null
          trust_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ethos_preferences: {
        Row: {
          id: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          created_at: string
          id: string
          integrity_score: number | null
          last_updated: string
          mint_address: string
          token_name: string | null
          token_symbol: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          integrity_score?: number | null
          last_updated?: string
          mint_address: string
          token_name?: string | null
          token_symbol?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          integrity_score?: number | null
          last_updated?: string
          mint_address?: string
          token_name?: string | null
          token_symbol?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          analysis_count: number
          created_at: string
          email: string
          escrow_count: number
          id: string
          last_sign_in_at: string
          watchlist_count: number
        }[]
      }
      admin_metrics: { Args: never; Returns: Json }
      admin_top_tokens: {
        Args: { _limit?: number }
        Returns: {
          analysis_count: number
          avg_integrity: number
          mint_address: string
          token_name: string
          token_symbol: string
        }[]
      }
      get_public_escrow: { Args: { _id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_dispute_party: { Args: { _dispute_id: string }; Returns: boolean }
      is_escrow_party: { Args: { _escrow_id: string }; Returns: boolean }
      payee_accept_escrow: {
        Args: { _id: string; _wallet: string }
        Returns: boolean
      }
      payee_request_audd: { Args: { _id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      dispute_status:
        | "open"
        | "under_review"
        | "negotiating"
        | "resolved"
        | "cancelled"
        | "escalated"
      escrow_event_type:
        | "created"
        | "locked"
        | "milestone_approved"
        | "released"
        | "disputed"
        | "cancelled"
        | "expired"
        | "note"
      escrow_status:
        | "pending"
        | "locked"
        | "in_review"
        | "released"
        | "disputed"
        | "expired"
        | "cancelled"
        | "escalated"
      proposal_status: "pending" | "accepted" | "rejected" | "superseded"
      trust_level: "low" | "medium" | "high"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      dispute_status: [
        "open",
        "under_review",
        "negotiating",
        "resolved",
        "cancelled",
        "escalated",
      ],
      escrow_event_type: [
        "created",
        "locked",
        "milestone_approved",
        "released",
        "disputed",
        "cancelled",
        "expired",
        "note",
      ],
      escrow_status: [
        "pending",
        "locked",
        "in_review",
        "released",
        "disputed",
        "expired",
        "cancelled",
        "escalated",
      ],
      proposal_status: ["pending", "accepted", "rejected", "superseded"],
      trust_level: ["low", "medium", "high"],
    },
  },
} as const
