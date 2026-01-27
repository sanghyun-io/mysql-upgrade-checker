# MySQL 8.0 → 8.4 Upgrade Compatibility Checker

MySQL 8.0에서 8.4로 업그레이드하기 전에 스키마와 데이터의 호환성 문제를 사전에 발견하는 웹 기반 도구입니다.

![MySQL Upgrade Checker](https://img.shields.io/badge/MySQL-8.0→8.4-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![No Server Required](https://img.shields.io/badge/server-not%20required-brightgreen)

## ✨ 주요 기능

- 🔍 **스키마 호환성 검사** - deprecated 데이터 타입, 문자셋, 스토리지 엔진 등 확인
- 📊 **데이터 무결성 검사** - 잘못된 날짜, ENUM 빈 값, 4바이트 문자 등 감지
- 🔧 **실행 가능한 수정 쿼리 제공** - 발견된 문제를 즉시 수정할 수 있는 SQL 생성
- 🔒 **완전한 클라이언트 사이드 처리** - 데이터가 외부로 전송되지 않음
- 📁 **mysqlsh dump 완벽 지원** - 여러 파일로 분산된 덤프 자동 분석

## 🚀 빠른 시작

### 온라인 사용 (권장)

GitHub Pages에서 바로 사용 가능합니다:

👉 **[https://yourusername.github.io/mysql-upgrade-checker](https://yourusername.github.io/mysql-upgrade-checker)**

### 로컬 실행

1. 이 레포지토리를 클론하거나 `index.html` 파일을 다운로드
2. 브라우저에서 `index.html` 파일 열기
3. mysqlsh dump 폴더 선택 및 분석 시작

```bash
# Clone
git clone https://github.com/yourusername/mysql-upgrade-checker.git
cd mysql-upgrade-checker

# 브라우저에서 index.html 열기
open index.html  # macOS
xdg-open index.html  # Linux
start index.html  # Windows
```

## 📖 사용 방법

### 1. Dump 파일 준비

**mysqlsh를 사용한 덤프:**

```bash
mysqlsh --uri user@host:3306 -- util dump-instance /path/to/dump \
  --threads=4 \
  --compression=none
```

### 2. 분석 실행

1. 웹 페이지에서 **"📁 폴더 선택"** 클릭
2. mysqlsh dump 폴더 선택
3. **"🔍 분석 시작"** 클릭
4. 결과 확인 및 수정 쿼리 다운로드

### 3. 문제 해결

분석 결과에서 각 이슈마다 제공되는:
- 📋 **복사** 버튼으로 개별 수정 쿼리 복사
- 🔧 **모든 수정 쿼리 다운로드** 버튼으로 전체 SQL 파일 다운로드

## 🔍 검사 항목

### 스키마 호환성

| 검사 항목 | 심각도 | 설명 |
|---------|--------|------|
| utf8 문자셋 | WARNING | MySQL 8.4에서 utf8은 utf8mb4를 가리킴 |
| MyISAM 엔진 | WARNING | InnoDB 사용 권장 |
| YEAR(2) | ERROR | Deprecated, YEAR(4)로 자동 변환됨 |
| ZEROFILL | WARNING | MySQL 8.0.17부터 deprecated |
| FLOAT(M,D), DOUBLE(M,D) | WARNING | Deprecated, DECIMAL 권장 |
| INT(N) display width | INFO | MySQL 8.0.17부터 deprecated |
| SQL_CALC_FOUND_ROWS | WARNING | MySQL 8.0.17부터 deprecated |

### 데이터 무결성

| 검사 항목 | 심각도 | 설명 |
|---------|--------|------|
| 0000-00-00 날짜 | ERROR | NO_ZERO_DATE 모드에서 허용 안 됨 |
| ENUM 빈 값 | ERROR | Strict 모드에서 문제 발생 |
| 4바이트 UTF-8 문자 | WARNING | utf8mb3로 저장 불가 (이모지 등) |
| NULL 바이트 | ERROR | 데이터에 \0 포함 |
| TIMESTAMP 범위 초과 | ERROR | 1970~2038 범위 벗어남 |

## 💾 출력 예시

### 수정 쿼리 예시

```sql
-- MySQL 8.0 to 8.4 업그레이드 수정 쿼리
-- 생성일시: 2026-01-27T12:00:00.000Z
-- 총 5개의 수정 쿼리

-- 잘못된 날짜 값: 0000-00-00
-- 위치: users.sql - Table: users
UPDATE `users` SET `created_at` = NULL WHERE `created_at` = '0000-00-00';

-- ENUM 컬럼에 빈 값
-- 위치: orders.sql - Table: orders, Column: status
UPDATE `orders` SET `status` = 'pending' WHERE `status` = '';

-- utf8 문자셋 사용 (utf8mb3)
-- 위치: products.sql - Table: products
ALTER TABLE `products` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 🏗️ 기술 스택

- **순수 HTML/CSS/JavaScript** - 프레임워크 없음
- **클라이언트 사이드 처리** - 서버 불필요
- **File API** - 로컬 파일 읽기
- **Blob API** - 파일 다운로드

## 🔒 보안 및 프라이버시

- ✅ **모든 처리가 브라우저에서만 실행**
- ✅ **데이터가 외부 서버로 전송되지 않음**
- ✅ **네트워크 연결 불필요** (로컬 실행 시)
- ✅ **덤프 파일이 로컬에만 유지됨**

## 📋 지원하는 파일 형식

- ✅ `.sql` - 스키마 및 INSERT 문
- ✅ `.tsv` - mysqlsh 데이터 파일
- ✅ `.json` - mysqlsh 메타데이터 (@.json)
- ⏭️ `load-progress*.json` - 자동 건너뛰기

## 🤝 기여

기여를 환영합니다! 다음 방법으로 참여하실 수 있습니다:

1. 이슈 생성 - 버그 리포트 또는 기능 제안
2. Pull Request - 코드 개선 또는 새 기능 추가
3. 문서 개선 - README, 주석 등

### 개발 환경 설정

```bash
git clone https://github.com/yourusername/mysql-upgrade-checker.git
cd mysql-upgrade-checker

# 로컬 서버 실행 (선택사항)
python -m http.server 8000
# 또는
npx serve
```

## 📝 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능합니다.

## 🙏 크레딧

- MySQL 공식 문서의 호환성 정보 기반
- mysqlsh dump 형식 지원

## 📞 문의

이슈나 질문이 있으시면 [GitHub Issues](https://github.com/yourusername/mysql-upgrade-checker/issues)에 등록해주세요.

---

**⚠️ 면책 조항:** 이 도구는 주요 호환성 문제를 감지하지만, 실제 프로덕션 환경으로 업그레이드하기 전에는 반드시 테스트 환경에서 충분한 검증을 수행해야 합니다.
