# MySQL 8.0 → 8.4 업그레이드 호환성 검증기

MySQL 8.0에서 8.4로 업그레이드하기 전에 스키마와 데이터의 호환성 문제를 사전에 발견하는 웹 기반 도구입니다.

[English](README.md) | **한국어**

## ✨ 주요 기능

- 🔍 **스키마 호환성 검사** - deprecated 데이터 타입, 문자셋, 스토리지 엔진 등 확인
- 📊 **데이터 무결성 검사** - 잘못된 날짜, ENUM 빈 값, 4바이트 문자 등 감지
- 🔧 **실행 가능한 수정 쿼리 제공** - 발견된 문제를 즉시 수정할 수 있는 SQL 생성
- 🔒 **완전한 클라이언트 사이드 처리** - 데이터가 외부로 전송되지 않음
- 📁 **mysqlsh dump 완벽 지원** - 여러 파일로 분산된 덤프 자동 분석

## 🚀 빠른 시작

### 온라인 사용 (권장)

GitHub Pages에서 바로 사용하세요:

👉 **[https://yourusername.github.io/mysql-upgrade-checker](https://yourusername.github.io/mysql-upgrade-checker)**

### 로컬 실행

1. 이 레포지토리를 클론하거나 `index.html` 다운로드
2. 브라우저에서 `index.html` 열기
3. mysqlsh dump 폴더 선택 및 분석

```bash
git clone https://github.com/yourusername/mysql-upgrade-checker.git
cd mysql-upgrade-checker
open index.html  # 브라우저에서 열기
```

## 📖 사용 방법

### 1. 덤프 파일 생성

```bash
mysqlsh --uri user@host:3306 -- util dump-instance /path/to/dump \
  --threads=4 \
  --compression=none
```

### 2. 분석 실행

1. **"📁 폴더 선택"** 버튼 클릭
2. mysqlsh dump 폴더 선택
3. **"🔍 분석 시작"** 클릭
4. 결과 확인 및 수정 쿼리 다운로드

## 🔍 검사 항목

### 스키마 호환성
- utf8/utf8mb3 문자셋
- MyISAM 엔진
- YEAR(2) 타입
- ZEROFILL 속성
- FLOAT/DOUBLE 정밀도
- INT display width
- SQL_CALC_FOUND_ROWS

### 데이터 무결성
- 0000-00-00 날짜
- ENUM 빈 값
- 4바이트 UTF-8 문자 (이모지)
- NULL 바이트
- TIMESTAMP 범위 초과

## 💾 출력 형식

분석 완료 후 다음을 다운로드할 수 있습니다:

1. **JSON 리포트** - 전체 분석 결과
2. **SQL 파일** - 바로 실행 가능한 수정 쿼리

### 수정 쿼리 예시

```sql
-- 잘못된 날짜 값: 0000-00-00
UPDATE `users` SET `created_at` = NULL WHERE `created_at` = '0000-00-00';

-- ENUM 컬럼에 빈 값
UPDATE `orders` SET `status` = 'pending' WHERE `status` = '';

-- utf8 문자셋 사용
ALTER TABLE `products` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 🔒 보안

- ✅ 모든 처리가 브라우저에서만 실행됨
- ✅ 데이터가 외부로 전송되지 않음
- ✅ 네트워크 연결 불필요
- ✅ 덤프 파일이 로컬에만 유지됨

## 🤝 기여

이슈, Pull Request, 문서 개선 모두 환영합니다!

## 📝 라이선스

MIT License

---

**⚠️ 주의:** 실제 프로덕션 환경으로 업그레이드하기 전에는 반드시 테스트 환경에서 충분한 검증을 수행하세요.
