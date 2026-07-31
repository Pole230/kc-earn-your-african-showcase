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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_messages: {
        Row: {
          client_message_id: string | null
          created_at: string
          id: string
          parts: Json
          role: string
          user_id: string
        }
        Insert: {
          client_message_id?: string | null
          created_at?: string
          id?: string
          parts?: Json
          role: string
          user_id: string
        }
        Update: {
          client_message_id?: string | null
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      earnings: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          source: Database["public"]["Enums"]["earning_source"]
          user_id: string
          video_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          source?: Database["public"]["Enums"]["earning_source"]
          user_id: string
          video_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          source?: Database["public"]["Enums"]["earning_source"]
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "earnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          location: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id: string
          location?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          location?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      videos: {
        Row: {
          category: Database["public"]["Enums"]["video_category"]
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          status: Database["public"]["Enums"]["video_status"]
          thumbnail_path: string | null
          title: string
          updated_at: string
          user_id: string
          video_path: string
          views_count: number
        }
        Insert: {
          category: Database["public"]["Enums"]["video_category"]
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          status?: Database["public"]["Enums"]["video_status"]
          thumbnail_path?: string | null
          title: string
          updated_at?: string
          user_id: string
          video_path: string
          views_count?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["video_category"]
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          status?: Database["public"]["Enums"]["video_status"]
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          video_path?: string
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "videos_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          available_balance: number
          created_at: string
          currency: string
          lifetime_earned: number
          pending_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number
          created_at?: string
          currency?: string
          lifetime_earned?: number
          pending_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number
          created_at?: string
          currency?: string
          lifetime_earned?: number
          pending_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          amount: number
          created_at: string
          destination: string
          id: string
          method: string
          note: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          destination: string
          id?: string
          method: string
          note?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          destination?: string
          id?: string
          method?: string
          note?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      request_withdrawal: {
        Args: { _amount: number; _destination: string; _method: string }
        Returns: {
          amount: number
          created_at: string
          destination: string
          id: string
          method: string
          note: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "withdrawals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      earning_source: "views" | "engagement" | "bonus" | "referral"
      video_category:
        | "Funny"
        | "Music"
        | "Experience"
        | "Sports"
        | "Learning"
        | "Serious Topics"
      video_status: "processing" | "published" | "removed"
      withdrawal_status: "pending" | "processing" | "paid" | "rejected"
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
      earning_source: ["views", "engagement", "bonus", "referral"],
      video_category: [
        "Funny",
        "Music",
        "Experience",
        "Sports",
        "Learning",
        "Serious Topics",
      ],
      video_status: ["processing", "published", "removed"],
      withdrawal_status: ["pending", "processing", "paid", "rejected"],
    },
  },
} as const
