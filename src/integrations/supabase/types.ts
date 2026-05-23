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
          amount_audd: number
          condition_type: string
          created_at: string
          description: string | null
          disputed_at: string | null
          expires_at: string | null
          id: string
          payer_wallet: string
          receiver_wallet: string
          released_at: string | null
          status: Database["public"]["Enums"]["escrow_status"]
          trust_factors: Json | null
          trust_level: Database["public"]["Enums"]["trust_level"] | null
          trust_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_audd: number
          condition_type?: string
          created_at?: string
          description?: string | null
          disputed_at?: string | null
          expires_at?: string | null
          id?: string
          payer_wallet: string
          receiver_wallet: string
          released_at?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          trust_factors?: Json | null
          trust_level?: Database["public"]["Enums"]["trust_level"] | null
          trust_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_audd?: number
          condition_type?: string
          created_at?: string
          description?: string | null
          disputed_at?: string | null
          expires_at?: string | null
          id?: string
          payer_wallet?: string
          receiver_wallet?: string
          released_at?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
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
      [_ in never]: never
    }
    Enums: {
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
      ],
      trust_level: ["low", "medium", "high"],
    },
  },
} as const
