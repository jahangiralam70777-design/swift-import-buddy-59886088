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
      academic_chapters: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          position: number
          slug: string | null
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          position?: number
          slug?: string | null
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          position?: number
          slug?: string | null
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "academic_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_levels: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          position: number
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          position?: number
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          position?: number
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      academic_subjects: {
        Row: {
          created_at: string
          description: string
          id: string
          level_id: string
          name: string
          position: number
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          level_id: string
          name: string
          position?: number
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          level_id?: string
          name?: string
          position?: number
          slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_subjects_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "academic_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_settings: {
        Row: {
          id: string
          settings: Json
          singleton: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          settings?: Json
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          settings?: Json
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          note: string | null
          question_id: string
          source: Database["public"]["Enums"]["question_source"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          question_id: string
          source: Database["public"]["Enums"]["question_source"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          question_id?: string
          source?: Database["public"]["Enums"]["question_source"]
          user_id?: string
        }
        Relationships: []
      }
      custom_exam_answers: {
        Row: {
          answer: string | null
          created_at: string
          id: string
          is_correct: boolean | null
          question_id: string
          selected_index: number | null
          session_id: string
          source: Database["public"]["Enums"]["question_source"]
          time_spent_ms: number | null
          user_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id: string
          selected_index?: number | null
          session_id: string
          source: Database["public"]["Enums"]["question_source"]
          time_spent_ms?: number | null
          user_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id?: string
          selected_index?: number | null
          session_id?: string
          source?: Database["public"]["Enums"]["question_source"]
          time_spent_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_exam_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "custom_exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_exam_sessions: {
        Row: {
          config: Json
          correct_count: number
          created_at: string
          finished_at: string | null
          id: string
          score: number | null
          started_at: string
          title: string | null
          total_questions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          correct_count?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          score?: number | null
          started_at?: string
          title?: string | null
          total_questions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          correct_count?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          score?: number | null
          started_at?: string
          title?: string | null
          total_questions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mcq_attempts: {
        Row: {
          chapter_id: string | null
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_index: number | null
          session_id: string | null
          time_spent_ms: number | null
          user_id: string
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_index?: number | null
          session_id?: string | null
          time_spent_ms?: number | null
          user_id: string
        }
        Update: {
          chapter_id?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_index?: number | null
          session_id?: string | null
          time_spent_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_attempts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "academic_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcq_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mcq_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      mcq_questions: {
        Row: {
          batch_id: string | null
          chapter_id: string
          correct_index: number
          created_at: string
          created_by: string | null
          explanation: string | null
          id: string
          options: Json
          position: number
          question: string
          status: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          chapter_id: string
          correct_index?: number
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          question: string
          status?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          chapter_id?: string
          correct_index?: number
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          question?: string
          status?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "academic_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          institution: string | null
          phone: string | null
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          institution?: string | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          institution?: string | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qbank_attempts: {
        Row: {
          answer: string | null
          chapter_id: string | null
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_index: number | null
          session_id: string | null
          time_spent_ms: number | null
          user_id: string
        }
        Insert: {
          answer?: string | null
          chapter_id?: string | null
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_index?: number | null
          session_id?: string | null
          time_spent_ms?: number | null
          user_id: string
        }
        Update: {
          answer?: string | null
          chapter_id?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_index?: number | null
          session_id?: string | null
          time_spent_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbank_attempts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "academic_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qbank_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "qbank_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      qbank_questions: {
        Row: {
          answer: string | null
          batch_id: string | null
          chapter_id: string
          correct_index: number
          created_at: string
          created_by: string | null
          explanation: string | null
          id: string
          options: Json
          position: number
          prompt: string | null
          question: string | null
          status: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          answer?: string | null
          batch_id?: string | null
          chapter_id: string
          correct_index?: number
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          prompt?: string | null
          question?: string | null
          status?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          answer?: string | null
          batch_id?: string | null
          chapter_id?: string
          correct_index?: number
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          prompt?: string | null
          question?: string | null
          status?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbank_questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "academic_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          routine_id: string
          target_type: string
          target_user_id: string | null
          target_value: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          routine_id: string
          target_type: string
          target_user_id?: string | null
          target_value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          routine_id?: string
          target_type?: string
          target_user_id?: string | null
          target_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_assignments_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_days: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          label: string | null
          position: number
          routine_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          label?: string | null
          position?: number
          routine_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          label?: string | null
          position?: number
          routine_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_days_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_task_completions: {
        Row: {
          completed_at: string | null
          completed_on: string
          created_at: string
          id: string
          note: string | null
          status: string
          study_hours: number
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_on: string
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          study_hours?: number
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_on?: string
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          study_hours?: number
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "routine_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_tasks: {
        Row: {
          created_at: string
          day_id: string | null
          details: Json
          end_time: string | null
          id: string
          position: number
          routine_id: string
          start_time: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_id?: string | null
          details?: Json
          end_time?: string | null
          id?: string
          position?: number
          routine_id: string
          start_time?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_id?: string | null
          details?: Json
          end_time?: string | null
          id?: string
          position?: number
          routine_id?: string
          start_time?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_tasks_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "routine_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_tasks_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          accent: string | null
          chapter: string | null
          config: Json
          created_at: string
          description: string | null
          ends_on: string | null
          hours_per_day: number
          id: string
          is_active: boolean
          is_archived: boolean
          level: string | null
          routine_type: string
          starts_on: string | null
          subject: string | null
          target_chapters: number | null
          target_mcqs: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent?: string | null
          chapter?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          ends_on?: string | null
          hours_per_day?: number
          id?: string
          is_active?: boolean
          is_archived?: boolean
          level?: string | null
          routine_type?: string
          starts_on?: string | null
          subject?: string | null
          target_chapters?: number | null
          target_mcqs?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent?: string | null
          chapter?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          ends_on?: string | null
          hours_per_day?: number
          id?: string
          is_active?: boolean
          is_archived?: boolean
          level?: string | null
          routine_type?: string
          starts_on?: string | null
          subject?: string | null
          target_chapters?: number | null
          target_mcqs?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_preferences: {
        Row: {
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          preferences?: Json
          updated_at?: string
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
      wrong_answer_bookmarks: {
        Row: {
          cleared_at: string | null
          created_at: string
          id: string
          last_wrong_at: string
          question_id: string
          source: Database["public"]["Enums"]["question_source"]
          user_id: string
          wrong_count: number
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string
          id?: string
          last_wrong_at?: string
          question_id: string
          source: Database["public"]["Enums"]["question_source"]
          user_id: string
          wrong_count?: number
        }
        Update: {
          cleared_at?: string | null
          created_at?: string
          id?: string
          last_wrong_at?: string
          question_id?: string
          source?: Database["public"]["Enums"]["question_source"]
          user_id?: string
          wrong_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_user: {
        Args: { p_user_id: string }
        Returns: {
          banned_until: string
          created_at: string
          email: string
          email_confirmed_at: string
          full_name: string
          id: string
          institution: string
          last_sign_in_at: string
          phone: string
          photo_url: string
          role: string
        }[]
      }
      admin_list_users: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_role?: string
          p_search?: string
          p_sort?: string
          p_status?: string
          p_to?: string
          p_verified?: string
        }
        Returns: {
          banned_until: string
          created_at: string
          email: string
          email_confirmed_at: string
          full_name: string
          id: string
          last_sign_in_at: string
          phone: string
          photo_url: string
          role: string
          total_count: number
        }[]
      }
      admin_user_stats: {
        Args: never
        Returns: {
          active_today: number
          admins: number
          new_last_7_days: number
          students: number
          total: number
          verified: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mcq_practice_taxonomy: {
        Args: never
        Returns: {
          bookmarks: number
          chapter_description: string
          chapter_id: string
          chapter_name: string
          chapter_position: number
          chapter_slug: string
          correct: number
          done: number
          last_practiced_at: string
          level_description: string
          level_id: string
          level_name: string
          level_position: number
          level_slug: string
          subject_description: string
          subject_id: string
          subject_name: string
          subject_position: number
          subject_slug: string
          time_spent_ms: number
          total_mcqs: number
          wrong: number
        }[]
      }
      qbank_practice_taxonomy: {
        Args: never
        Returns: {
          bookmarks: number
          chapter_description: string
          chapter_id: string
          chapter_name: string
          chapter_position: number
          chapter_slug: string
          correct: number
          done: number
          last_practiced_at: string
          level_description: string
          level_id: string
          level_name: string
          level_position: number
          level_slug: string
          subject_description: string
          subject_id: string
          subject_name: string
          subject_position: number
          subject_slug: string
          time_spent_ms: number
          total_mcqs: number
          wrong: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "student"
      question_source: "mcq" | "qbank"
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
      app_role: ["admin", "student"],
      question_source: ["mcq", "qbank"],
    },
  },
} as const
