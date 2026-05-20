-- 법령ID가 없는(undefined) 잘못 등록된 법령 삭제
DELETE FROM laws WHERE law_id IS NULL OR law_id = '' OR law_id = 'undefined';

-- 삭제 후 확인
SELECT COUNT(*) as remaining FROM laws;
