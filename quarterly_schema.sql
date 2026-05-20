-- =====================================================
-- 법령 모니터링 시스템 - 분기점검 테이블 추가
-- Supabase SQL Editor에서 실행하세요
-- =====================================================

-- 1. 분기점검 기록 테이블
CREATE TABLE IF NOT EXISTS quarterly_inspections (
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    title TEXT,
    status VARCHAR(20) DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS, COMPLETED
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 2. 점검 항목 테이블 (법령별 1건씩)
CREATE TABLE IF NOT EXISTS inspection_items (
    id BIGSERIAL PRIMARY KEY,
    inspection_id BIGINT REFERENCES quarterly_inspections(id) ON DELETE CASCADE,
    law_id VARCHAR(50),
    law_name TEXT NOT NULL,
    serial_no VARCHAR(50),
    ministry VARCHAR(100),
    change_date VARCHAR(20),
    change_type VARCHAR(50) DEFAULT '해당없음',
    promulgation_no VARCHAR(100),
    revision_reason TEXT,
    has_change BOOLEAN DEFAULT FALSE,
    assignee VARCHAR(100),
    department VARCHAR(100),
    action_required BOOLEAN DEFAULT FALSE,
    action_content TEXT,
    action_status VARCHAR(20) DEFAULT 'PENDING',   -- PENDING, IN_PROGRESS, COMPLETED, NOT_REQUIRED
    action_due_date DATE,
    review_notes TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 생성 확인
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('quarterly_inspections', 'inspection_items')
ORDER BY table_name;
