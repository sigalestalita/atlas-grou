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
      companies: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          primary_color: string
          secondary_color: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string
          secondary_color?: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          secondary_color?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      evaluation_assignments: {
        Row: {
          company_id: string
          created_at: string
          evaluatee_name: string
          evaluator_name: string
          id: string
          survey_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          evaluatee_name: string
          evaluator_name: string
          id?: string
          survey_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          evaluatee_name?: string
          evaluator_name?: string
          id?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_assignments_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      report_access_codes: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          last_used_at: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_access_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      respondents: {
        Row: {
          last_reminder_at: string | null
          reminder_count: number
          started_at: string | null
          company_id: string
          company_leadership: string | null
          created_at: string
          department: string | null
          department_leadership: string | null
          email: string | null
          id: string
          name: string | null
          responded_at: string | null
          status: string
          survey_id: string
          token: string
        }
        Insert: {
          last_reminder_at?: string | null
          reminder_count?: number
          started_at?: string | null
          company_id: string
          company_leadership?: string | null
          created_at?: string
          department?: string | null
          department_leadership?: string | null
          email?: string | null
          id?: string
          name?: string | null
          responded_at?: string | null
          status?: string
          survey_id: string
          token: string
        }
        Update: {
          last_reminder_at?: string | null
          reminder_count?: number
          started_at?: string | null
          company_id?: string
          company_leadership?: string | null
          created_at?: string
          department?: string | null
          department_leadership?: string | null
          email?: string | null
          id?: string
          name?: string | null
          responded_at?: string | null
          status?: string
          survey_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "respondents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respondents_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          created_at: string
          has_justification: boolean
          id: string
          justification_prompt: string | null
          options: Json | null
          question_type: string
          scale_type: string | null
          section_id: string
          sort_order: number
          text: string
        }
        Insert: {
          created_at?: string
          has_justification?: boolean
          id?: string
          justification_prompt?: string | null
          options?: Json | null
          question_type?: string
          scale_type?: string | null
          section_id: string
          sort_order?: number
          text: string
        }
        Update: {
          created_at?: string
          has_justification?: boolean
          id?: string
          justification_prompt?: string | null
          options?: Json | null
          question_type?: string
          scale_type?: string | null
          section_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "survey_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          submission_id: string | null
          company_leadership: string | null
          department: string | null
          department_leadership: string | null
          evaluated_leader: string | null
          id: string
          question_id: string
          submitted_at: string
          survey_id: string
          text_value: string | null
          value: number | null
        }
        Insert: {
          submission_id?: string | null
          company_leadership?: string | null
          department?: string | null
          department_leadership?: string | null
          evaluated_leader?: string | null
          id?: string
          question_id: string
          submitted_at?: string
          survey_id: string
          text_value?: string | null
          value?: number | null
        }
        Update: {
          submission_id?: string | null
          company_leadership?: string | null
          department?: string | null
          department_leadership?: string | null
          evaluated_leader?: string | null
          id?: string
          question_id?: string
          submitted_at?: string
          survey_id?: string
          text_value?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_sections: {
        Row: {
          created_at: string
          id: string
          section_type: string
          sort_order: number
          survey_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          section_type?: string
          sort_order?: number
          survey_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          section_type?: string
          sort_order?: number
          survey_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_sections_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          closes_at: string | null
          opens_at: string | null
          wave_label: string | null
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          intro_text: string | null
          is_template: boolean
          leaders: Json | null
          open_access: boolean
          scale_labels: Json | null
          scale_max: number
          scale_min: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          opens_at?: string | null
          wave_label?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          intro_text?: string | null
          is_template?: boolean
          leaders?: Json | null
          open_access?: boolean
          scale_labels?: Json | null
          scale_max?: number
          scale_min?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          opens_at?: string | null
          wave_label?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          intro_text?: string | null
          is_template?: boolean
          leaders?: Json | null
          open_access?: boolean
          scale_labels?: Json | null
          scale_max?: number
          scale_min?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surveys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "company_admin"
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
      app_role: ["super_admin", "company_admin"],
    },
  },
} as const
