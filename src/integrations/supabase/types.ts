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
      ad_campaigns: {
        Row: {
          advertiser_id: string
          budget: number
          cost_per_click: number
          cost_per_view: number
          created_at: string
          description: string | null
          destination_url: string | null
          ends_at: string | null
          headline: string | null
          id: string
          media_path: string | null
          name: string
          spent: number
          starts_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          target_categories: Database["public"]["Enums"]["video_category"][]
          target_countries: string[]
          updated_at: string
        }
        Insert: {
          advertiser_id: string
          budget?: number
          cost_per_click?: number
          cost_per_view?: number
          created_at?: string
          description?: string | null
          destination_url?: string | null
          ends_at?: string | null
          headline?: string | null
          id?: string
          media_path?: string | null
          name: string
          spent?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_categories?: Database["public"]["Enums"]["video_category"][]
          target_countries?: string[]
          updated_at?: string
        }
        Update: {
          advertiser_id?: string
          budget?: number
          cost_per_click?: number
          cost_per_view?: number
          created_at?: string
          description?: string | null
          destination_url?: string | null
          ends_at?: string | null
          headline?: string | null
          id?: string
          media_path?: string | null
          name?: string
          spent?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_categories?: Database["public"]["Enums"]["video_category"][]
          target_countries?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertisers"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_events: {
        Row: {
          campaign_id: string
          cost: number
          country: string | null
          created_at: string
          device: string | null
          event_type: Database["public"]["Enums"]["ad_event_type"]
          id: string
          viewer_id: string | null
        }
        Insert: {
          campaign_id: string
          cost?: number
          country?: string | null
          created_at?: string
          device?: string | null
          event_type: Database["public"]["Enums"]["ad_event_type"]
          id?: string
          viewer_id?: string | null
        }
        Update: {
          campaign_id?: string
          cost?: number
          country?: string | null
          created_at?: string
          device?: string | null
          event_type?: Database["public"]["Enums"]["ad_event_type"]
          id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      advertisers: {
        Row: {
          company_name: string
          contact_email: string
          country: string | null
          created_at: string
          id: string
          is_approved: boolean
          owner_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          company_name: string
          contact_email: string
          country?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          owner_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_name?: string
          contact_email?: string
          country?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          owner_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
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
      external_ingestion_config: {
        Row: {
          id: boolean
          automatic_ingestion_enabled: boolean
          user_upload_priority: number
          max_external_feed_ratio: number
          external_content_limit: number
          ingestion_frequency_minutes: number
          approved_categories: string[]
          supported_countries: string[]
          enabled_providers: string[]
          updated_at: string
        }
        Insert: {
          id?: boolean
          automatic_ingestion_enabled?: boolean
          user_upload_priority?: number
          max_external_feed_ratio?: number
          external_content_limit?: number
          ingestion_frequency_minutes?: number
          approved_categories?: string[]
          supported_countries?: string[]
          enabled_providers?: string[]
          updated_at?: string
        }
        Update: {
          id?: boolean
          automatic_ingestion_enabled?: boolean
          user_upload_priority?: number
          max_external_feed_ratio?: number
          external_content_limit?: number
          ingestion_frequency_minutes?: number
          approved_categories?: string[]
          supported_countries?: string[]
          enabled_providers?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      external_ingestion_runs: {
        Row: {
          id: string
          provider: string
          started_at: string
          finished_at: string | null
          discovered_count: number
          imported_count: number
          unavailable_count: number
          error_message: string | null
        }
        Insert: {
          id?: string
          provider: string
          started_at?: string
          finished_at?: string | null
          discovered_count?: number
          imported_count?: number
          unavailable_count?: number
          error_message?: string | null
        }
        Update: {
          id?: string
          provider?: string
          started_at?: string
          finished_at?: string | null
          discovered_count?: number
          imported_count?: number
          unavailable_count?: number
          error_message?: string | null
        }
        Relationships: []
      }
      external_videos: {
        Row: {
          id: string
          source_platform: string
          original_content_id: string
          original_url: string
          creator_name: string
          creator_attribution: string
          thumbnail_url: string | null
          embed_url: string | null
          title: string
          description: string | null
          category: Database["public"]["Enums"]["video_category"]
          published_at: string | null
          ingested_at: string
          authorization_type: string
          external_status: string
          last_synced_at: string | null
          country_code: string | null
          language_code: string | null
          source_metadata: Json
          updated_at: string
        }
        Insert: {
          id?: string
          source_platform: string
          original_content_id: string
          original_url: string
          creator_name: string
          creator_attribution: string
          thumbnail_url?: string | null
          embed_url?: string | null
          title: string
          description?: string | null
          category: Database["public"]["Enums"]["video_category"]
          published_at?: string | null
          ingested_at?: string
          authorization_type: string
          external_status?: string
          last_synced_at?: string | null
          country_code?: string | null
          language_code?: string | null
          source_metadata?: Json
          updated_at?: string
        }
        Update: {
          external_status?: string
          last_synced_at?: string | null
          updated_at?: string
          title?: string
          description?: string | null
          thumbnail_url?: string | null
          embed_url?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payout_config: {
        Row: {
          currency: string
          daily_creator_limit: number
          daily_login_reward: number
          dedup_window_minutes: number
          id: boolean
          milestone_reward: number
          min_watch_percent: number
          min_watch_seconds: number
          min_withdrawal: number
          per_viewer_daily_limit: number
          rate_per_view: number
          referral_reward: number
          updated_at: string
        }
        Insert: {
          currency?: string
          daily_creator_limit?: number
          daily_login_reward?: number
          dedup_window_minutes?: number
          id?: boolean
          milestone_reward?: number
          min_watch_percent?: number
          min_watch_seconds?: number
          min_withdrawal?: number
          per_viewer_daily_limit?: number
          rate_per_view?: number
          referral_reward?: number
          updated_at?: string
        }
        Update: {
          currency?: string
          daily_creator_limit?: number
          daily_login_reward?: number
          dedup_window_minutes?: number
          id?: boolean
          milestone_reward?: number
          min_watch_percent?: number
          min_watch_seconds?: number
          min_withdrawal?: number
          per_viewer_daily_limit?: number
          rate_per_view?: number
          referral_reward?: number
          updated_at?: string
        }
        Relationships: []
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
      reward_claims: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["reward_kind"]
          reference: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["reward_kind"]
          reference: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["reward_kind"]
          reference?: string
          user_id?: string
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
      video_views: {
        Row: {
          country: string | null
          created_at: string
          creator_id: string
          device: string | null
          earned_amount: number
          fraud_reason: string | null
          id: string
          ip_hash: string | null
          is_valid: boolean
          percent_watched: number
          session_key: string | null
          video_id: string
          viewer_id: string | null
          watch_seconds: number
        }
        Insert: {
          country?: string | null
          created_at?: string
          creator_id: string
          device?: string | null
          earned_amount?: number
          fraud_reason?: string | null
          id?: string
          ip_hash?: string | null
          is_valid?: boolean
          percent_watched?: number
          session_key?: string | null
          video_id: string
          viewer_id?: string | null
          watch_seconds?: number
        }
        Update: {
          country?: string | null
          created_at?: string
          creator_id?: string
          device?: string | null
          earned_amount?: number
          fraud_reason?: string | null
          id?: string
          ip_hash?: string | null
          is_valid?: boolean
          percent_watched?: number
          session_key?: string | null
          video_id?: string
          viewer_id?: string | null
          watch_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_views_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
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
      admin_grant_reward: {
        Args: {
          _amount: number
          _kind: Database["public"]["Enums"]["reward_kind"]
          _note?: string
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      admin_platform_stats: { Args: never; Returns: Json }
      admin_set_campaign_status: {
        Args: {
          _campaign_id: string
          _status: Database["public"]["Enums"]["campaign_status"]
        }
        Returns: {
          advertiser_id: string
          budget: number
          cost_per_click: number
          cost_per_view: number
          created_at: string
          description: string | null
          destination_url: string | null
          ends_at: string | null
          headline: string | null
          id: string
          media_path: string | null
          name: string
          spent: number
          starts_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          target_categories: Database["public"]["Enums"]["video_category"][]
          target_countries: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ad_campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_withdrawal: {
        Args: {
          _note?: string
          _status: Database["public"]["Enums"]["withdrawal_status"]
          _withdrawal_id: string
        }
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
      claim_daily_login: { Args: never; Returns: Json }
      creator_analytics: { Args: { _user_id?: string }; Returns: Json }
      credit_earning: {
        Args: {
          _amount: number
          _note?: string
          _source: Database["public"]["Enums"]["earning_source"]
          _user_id: string
          _video_id?: string
        }
        Returns: string
      }
      grant_reward: {
        Args: {
          _amount: number
          _kind: Database["public"]["Enums"]["reward_kind"]
          _note?: string
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_advertiser: {
        Args: { _advertiser_id: string; _user_id: string }
        Returns: boolean
      }
      push_notification: {
        Args: {
          _body?: string
          _kind: Database["public"]["Enums"]["notification_kind"]
          _metadata?: Json
          _title: string
          _user_id: string
        }
        Returns: string
      }
      record_ad_event: {
        Args: {
          _campaign_id: string
          _country?: string
          _device?: string
          _event_type: Database["public"]["Enums"]["ad_event_type"]
        }
        Returns: Json
      }
      record_video_view: {
        Args: {
          _country?: string
          _device?: string
          _ip_hash?: string
          _percent_watched: number
          _session_key?: string
          _video_id: string
          _watch_seconds: number
        }
        Returns: Json
      }
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
      ad_event_type: "impression" | "click"
      app_role: "admin" | "moderator" | "user"
      campaign_status:
        | "draft"
        | "pending_review"
        | "active"
        | "paused"
        | "completed"
        | "rejected"
      earning_source: "views" | "engagement" | "bonus" | "referral"
      notification_kind:
        | "earning_credited"
        | "withdrawal_requested"
        | "withdrawal_approved"
        | "withdrawal_rejected"
        | "campaign_approved"
        | "campaign_completed"
        | "reward_received"
        | "milestone_achieved"
        | "system"
      reward_kind:
        | "daily_login"
        | "referral"
        | "milestone"
        | "trending"
        | "challenge"
        | "event"
        | "promo"
      video_category:
        | "Funny"
        | "Music"
        | "Experience"
        | "Sports"
        | "Learning"
        | "Serious Topics"
      video_status: "processing" | "published" | "failed" | "removed"
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
      ad_event_type: ["impression", "click"],
      app_role: ["admin", "moderator", "user"],
      campaign_status: [
        "draft",
        "pending_review",
        "active",
        "paused",
        "completed",
        "rejected",
      ],
      earning_source: ["views", "engagement", "bonus", "referral"],
      notification_kind: [
        "earning_credited",
        "withdrawal_requested",
        "withdrawal_approved",
        "withdrawal_rejected",
        "campaign_approved",
        "campaign_completed",
        "reward_received",
        "milestone_achieved",
        "system",
      ],
      reward_kind: [
        "daily_login",
        "referral",
        "milestone",
        "trending",
        "challenge",
        "event",
        "promo",
      ],
      video_category: [
        "Funny",
        "Music",
        "Experience",
        "Sports",
        "Learning",
        "Serious Topics",
      ],
      video_status: ["processing", "published", "failed", "removed"],
      withdrawal_status: ["pending", "processing", "paid", "rejected"],
    },
  },
} as const
