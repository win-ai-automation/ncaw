export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type ContentStatus = 'received' | 'processing' | 'pending_review' | 'revision_requested' | 'approved' | 'scheduled' | 'published' | 'rejected' | 'failed'
export type RiskLevel = 'low' | 'medium' | 'high'
export type AppRole = 'employee' | 'reviewer' | 'admin'

export type Database = {
  public: {
    Tables: {
      profiles: { Row: { id: string; full_name: string; role: AppRole; avatar_url: string | null; created_at: string; updated_at: string }; Insert: { id: string; full_name: string; role?: AppRole; avatar_url?: string | null }; Update: { full_name?: string; role?: AppRole; avatar_url?: string | null }; Relationships: [] }
      content_items: { Row: { id: string; title: string; source_url: string | null; platform: string; raw_content: string | null; submitter_notes: string | null; status: ContentStatus; risk_level: RiskLevel; risk_flags: Json; submitted_by: string; assigned_reviewer: string | null; external_job_id: string | null; target_account_ids: Json; scheduled_at: string | null; published_at: string | null; created_at: string; updated_at: string }; Insert: { id?: string; title?: string; source_url?: string | null; platform?: string; raw_content?: string | null; submitter_notes?: string | null; status?: ContentStatus; risk_level?: RiskLevel; risk_flags?: Json; submitted_by: string; assigned_reviewer?: string | null; external_job_id?: string | null; target_account_ids?: Json; scheduled_at?: string | null }; Update: { title?: string; source_url?: string | null; raw_content?: string | null; submitter_notes?: string | null; status?: ContentStatus; risk_level?: RiskLevel; risk_flags?: Json; assigned_reviewer?: string | null; external_job_id?: string | null; target_account_ids?: Json; scheduled_at?: string | null; published_at?: string | null }; Relationships: [] }
      content_versions: { Row: { id: string; content_id: string; version_number: number; generated_payload: Json; editor_content: string | null; change_note: string | null; created_by: string | null; created_at: string }; Insert: { id?: string; content_id: string; version_number: number; generated_payload?: Json; editor_content?: string | null; change_note?: string | null; created_by?: string | null }; Update: never; Relationships: [] }
      content_reviews: { Row: { id: string; content_id: string; version_id: string; reviewer_id: string; decision: 'approve' | 'request_revision' | 'reject'; comment: string | null; created_at: string }; Insert: { id?: string; content_id: string; version_id: string; reviewer_id: string; decision: 'approve' | 'request_revision' | 'reject'; comment?: string | null }; Update: never; Relationships: [] }
      content_assets: { Row: { id: string; content_id: string; version_id: string; asset_type: 'case_study_markdown' | 'case_study_html' | 'social_pack' | 'accuracy_review' | 'social_image'; storage_path: string; mime_type: string; created_by: string | null; created_at: string }; Insert: { id?: string; content_id: string; version_id: string; asset_type: 'case_study_markdown' | 'case_study_html' | 'social_pack' | 'accuracy_review' | 'social_image'; storage_path: string; mime_type: string; created_by?: string | null }; Update: never; Relationships: [] }
      audit_events: { Row: { id: number; content_id: string | null; actor_id: string | null; action: string; metadata: Json; created_at: string }; Insert: never; Update: never; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: { has_app_role: { Args: { required_roles: AppRole[] }; Returns: boolean }; record_audit_event: { Args: { target_content_id: string | null; event_action: string; event_metadata?: Json }; Returns: number }; check_and_record_rate_limit: { Args: { bucket_name: string; request_limit?: number; window_seconds?: number }; Returns: boolean } }
    Enums: { app_role: AppRole; content_status: ContentStatus; risk_level: RiskLevel; review_decision: 'approve' | 'request_revision' | 'reject' }
    CompositeTypes: Record<string, never>
  }
}
