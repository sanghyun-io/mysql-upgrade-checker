# MySQL 8.0 → 8.4 업그레이드 호환성 검사기

> 한국어 | [English](./README.md)

MySQL 8.0에서 8.4로 업그레이드하기 전에 호환성 문제를 감지하는 종합적인 웹 기반 정적 분석 도구입니다. MySQL Shell의 `util.checkForServerUpgrade()` 함수와 동등한 검사를 구현합니다.

![MySQL Upgrade Checker](https://img.shields.io/badge/MySQL-8.0→8.4-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![No Server Required](https://img.shields.io/badge/server-not%20required-brightgreen)
![Tests](https://img.shields.io/badge/tests-288%20passed-brightgreen)

## 라이브 데모

👉 **[https://sanghyun-io.github.io/mysql-upgrade-checker](https://sanghyun-io.github.io/mysql-upgrade-checker)**

---

## 목차

- [기능](#-기능)
- [빠른 시작](#-빠른-시작)
- [호환성 검사](#-호환성-검사)
- [사용 방법](#-사용-방법)
- [리포트 내보내기](#-리포트-내보내기)
- [서버 쿼리 지원](#️-서버-쿼리-지원)
- [아키텍처](#️-아키텍처)
- [개발](#-개발)
- [보안 및 개인정보](#-보안-및-개인정보)
- [기여하기](#-기여하기)
- [라이선스](#-라이선스)

---

## ✨ 기능

### 핵심 기능

| 기능 | 설명 |
|------|------|
| **67개 호환성 규칙** | MySQL 8.4의 모든 주요 변경사항을 포괄하는 종합 검사 |
| **MySQL Shell 호환** | `util.checkForServerUpgrade()`와 동등한 검사 구현 |
| **정적 분석** | 라이브 데이터베이스 연결 없이 덤프 파일 분석 |
| **자동 수정 쿼리 생성** | 감지된 문제를 해결하는 실행 가능한 SQL 쿼리 생성 |
| **다중 형식 내보내기** | JSON, CSV 또는 MySQL Shell 형식으로 리포트 내보내기 |

### 주요 특징

- 🔍 **스키마 분석** - 더 이상 사용되지 않는 데이터 타입, 문자셋, 스토리지 엔진 및 구문 감지
- 📊 **데이터 무결성 검사** - 잘못된 날짜, ENUM 문제, 문자 인코딩 문제 찾기
- 🔐 **인증 감사** - 더 이상 사용되지 않는 인증 플러그인 및 권한 문제 식별
- 🔧 **실행 가능한 수정 쿼리** - 원클릭 복사 또는 수정 SQL 일괄 다운로드
- 🔒 **100% 클라이언트 사이드** - 외부 서버로 데이터 전송 없음, 오프라인 작동
- 📁 **mysqlsh 덤프 지원** - 다중 파일 덤프 자동 분석

---

## 🚀 빠른 시작

### 온라인 사용 (권장)

설치 없이 브라우저에서 바로 사용:

👉 **[https://sanghyun-io.github.io/mysql-upgrade-checker](https://sanghyun-io.github.io/mysql-upgrade-checker)**

### 로컬 설치

```bash
# 저장소 복제
git clone https://github.com/sanghyun-io/mysql-upgrade-checker.git
cd mysql-upgrade-checker

# 의존성 설치
npm install

# 개발 서버 시작
npm run dev

# 프로덕션 빌드
npm run build
```

---

## 🔍 호환성 검사

이 도구는 MySQL 8.4의 모든 주요 변경사항을 다루는 7개 카테고리에 걸쳐 **67개의 호환성 규칙**을 구현합니다.

### 1. 제거된 시스템 변수

MySQL 8.4에서 제거되어 서버 시작 실패를 유발하는 시스템 변수를 감지합니다.

| 변수 | 상태 | 영향 |
|------|------|------|
| `default_authentication_plugin` | 제거됨 | 서버 시작 불가 |
| `expire_logs_days` | 제거됨 | `binlog_expire_logs_seconds` 사용 |
| `master_info_repository` | 제거됨 | 기본 TABLE 저장소 사용 |
| `relay_log_info_repository` | 제거됨 | 기본 TABLE 저장소 사용 |
| `innodb_log_file_size` | 제거됨 | `innodb_redo_log_capacity` 사용 |
| `transaction_write_set_extraction` | 제거됨 | 기본 활성화 |
| + 42개 추가 변수 | 제거됨 | [전체 목록](./docs/removed-variables.md) 참조 |

### 2. 변경된 기본값

애플리케이션 동작에 영향을 줄 수 있는 기본값이 변경된 시스템 변수를 식별합니다.

| 변수 | 이전 기본값 | 새 기본값 | 비고 |
|------|-------------|-----------|------|
| `replica_parallel_workers` | 0 | 4 | 병렬 복제 활성화 |
| `innodb_adaptive_hash_index` | ON | OFF | 성능 튜닝 변경 |
| `innodb_flush_method` | fsync | O_DIRECT | I/O 최적화 |
| `innodb_io_capacity` | 200 | 10000 | SSD 최적화 기본값 |
| `innodb_change_buffering` | all | none | 변경 버퍼 단순화 |

### 3. 인증 및 권한

| 검사 | 심각도 | 설명 |
|------|--------|------|
| `mysql_native_password` | ERROR | 8.4에서 기본 비활성화, 명시적 활성화 필요 |
| `sha256_password` | WARNING | 더 이상 사용되지 않음, `caching_sha2_password`로 마이그레이션 |
| `authentication_fido` | ERROR | 8.4에서 완전히 제거됨 |
| `SUPER` 권한 | WARNING | 세분화된 동적 권한으로 대체 |
| 유효하지 않은 권한 | ERROR | 오류를 유발하는 제거된 권한 |

### 4. 스키마 호환성

| 검사 | 심각도 | 설명 |
|------|--------|------|
| `utf8` 문자셋 | WARNING | 별칭이 utf8mb3에서 utf8mb4로 변경 |
| `utf8mb3` 명시적 | WARNING | 더 이상 사용되지 않음, utf8mb4로 마이그레이션 |
| `latin1` 문자셋 | INFO | utf8mb4로 마이그레이션 고려 |
| `YEAR(2)` | ERROR | 제거됨, YEAR(4)로 자동 변환 |
| `ZEROFILL` | WARNING | 8.0.17부터 더 이상 사용되지 않음 |
| `FLOAT(M,D)` | WARNING | 정밀도 구문 더 이상 사용되지 않음 |
| `INT(N)` 표시 너비 | INFO | 표시 너비 더 이상 사용되지 않음 |
| `SQL_CALC_FOUND_ROWS` | WARNING | 더 이상 사용되지 않음, `COUNT(*)` 사용 |
| `GROUP BY ASC/DESC` | ERROR | 제거된 구문 |
| 예약어 | ERROR | 새 예약어: MANUAL, PARALLEL, QUALIFY, TABLESAMPLE |

### 5. 스토리지 엔진

| 검사 | 심각도 | 설명 |
|------|--------|------|
| MyISAM 테이블 | WARNING | 더 나은 성능을 위해 InnoDB로 마이그레이션 |
| 더 이상 사용되지 않는 엔진 | WARNING | BLACKHOLE, FEDERATED, ARCHIVE 고려사항 |
| 비네이티브 파티셔닝 | ERROR | 네이티브 InnoDB 파티셔닝 사용 |
| 공유 테이블스페이스 | WARNING | 파티션 테이블을 file-per-table로 이동 |

### 6. 데이터 무결성

| 검사 | 심각도 | 설명 |
|------|--------|------|
| `0000-00-00` 날짜 | ERROR | `NO_ZERO_DATE` 모드(기본값)에서 유효하지 않음 |
| `0000-00-00 00:00:00` | ERROR | 유효하지 않은 datetime 값 |
| 빈 ENUM 값 | ERROR | strict 모드에서 문제 발생 |
| ENUM 숫자 인덱스 | WARNING | 값 대신 인덱스 사용 |
| 4바이트 UTF-8 문자 | WARNING | utf8mb3에 저장 불가 (이모지 등) |
| 데이터 내 NULL 바이트 | ERROR | `\0` 문자 포함 |
| TIMESTAMP 범위 | ERROR | 1970-2038 범위 외 |

### 7. 명명 및 구문

| 검사 | 심각도 | 설명 |
|------|--------|------|
| 예약어 사용 | ERROR | 새 예약어를 사용하는 테이블/컬럼 이름 |
| 달러 기호 이름 | WARNING | 식별자의 `$` 더 이상 사용되지 않음 |
| 유효하지 않은 5.7 이름 | ERROR | 후행 공백 또는 제어 문자가 있는 이름 |
| 테이블 이름 내 FTS | WARNING | "FTS" 접두사는 fulltext용으로 예약됨 |
| FK 이름 길이 | ERROR | 64자 초과 외래 키 이름 |

---

## 📖 사용 방법

### 1단계: 덤프 파일 준비

MySQL Shell을 사용하여 덤프 생성:

```bash
# 전체 인스턴스 덤프
mysqlsh --uri user@host:3306 -- util dump-instance /path/to/dump \
  --threads=4 \
  --compression=none

# 단일 스키마 덤프
mysqlsh --uri user@host:3306 -- util dump-schemas mydb \
  --outputUrl=/path/to/dump \
  --compression=none
```

또는 mysqldump 사용:

```bash
mysqldump -u user -p --databases mydb > dump.sql
```

### 2단계: 업로드 및 분석

1. [웹 애플리케이션](https://sanghyun-io.github.io/mysql-upgrade-checker) 열기
2. **"📁 폴더 선택"** 클릭 또는 파일 드래그 앤 드롭
3. **"🔍 분석 시작"** 클릭
4. 분석 완료 대기

### 3단계: 결과 검토

결과는 심각도 표시와 함께 카테고리별로 구성됩니다:

- 🔴 **ERROR** - 업그레이드 전 반드시 수정
- 🟡 **WARNING** - 검토 및 수정 권장
- 🔵 **INFO** - 선택적 개선사항

### 4단계: 내보내기 및 수정

- 📋 버튼으로 **개별 수정 쿼리 복사**
- SQL 파일로 **모든 수정 쿼리 다운로드**
- JSON, CSV 또는 MySQL Shell 형식으로 **리포트 내보내기**

---

## 📊 리포트 내보내기

### 내보내기 형식

| 형식 | 용도 |
|------|------|
| **JSON** | CI/CD 파이프라인 통합, 프로그래밍 방식 처리 |
| **CSV** | 스프레드시트 분석, 추적, 문서화 |
| **MySQL Shell** | 기존 MySQL Shell 워크플로우와 호환 |

### MySQL Shell 형식 예시

```
The MySQL server at /path/to/dump, version 8.0.37, will now be checked for compatibility issues for upgrade to MySQL 8.4...

1) Removed system variables

  Error: The following system variables are removed in MySQL 8.4:
    - default_authentication_plugin
    - expire_logs_days
  More information: https://dev.mysql.com/doc/refman/8.4/en/added-deprecated-removed.html

2) Usage of mysql_native_password authentication plugin

  Warning: The following users are using mysql_native_password:
    - 'app_user'@'%'
  More information: https://dev.mysql.com/doc/refman/8.4/en/caching-sha2-password.html

Errors:   2
Warnings: 5
Notices:  3
```

---

## 🖥️ 서버 쿼리 지원

일부 검사는 라이브 서버 접근이 필요합니다. 도구에서 바로 실행 가능한 SQL 쿼리를 제공합니다:

### 사용 가능한 서버 검사

| 검사 | 쿼리 목적 |
|------|-----------|
| 시스템 변수 기본값 | 현재 값과 새 8.4 기본값 비교 |
| 인증 플러그인 | 더 이상 사용되지 않는 인증 방법을 사용하는 사용자 목록 |
| 순환 디렉토리 참조 | 테이블스페이스 경로 문제 감지 |
| 사용자 통계 | 인증 방법 분포 |

### 사용 방법

1. **"서버 쿼리"** 탭으로 이동
2. 제공된 SQL 쿼리 복사
3. MySQL 서버에서 실행
4. 결과를 도구에 붙여넣기
5. 분석 결과 확인

---

## 🏗️ 아키텍처

### 프로젝트 구조

```
mysql-upgrade-checker/
├── src/
│   ├── index.html              # 메인 HTML
│   ├── styles/
│   │   └── main.css            # 스타일시트
│   └── scripts/
│       ├── main.ts             # 진입점
│       ├── analyzer.ts         # 파일 분석 엔진
│       ├── types.ts            # TypeScript 정의
│       ├── constants.ts        # MySQL 8.4 호환성 데이터
│       ├── ui.ts               # UI 렌더링
│       ├── report.ts           # 리포트 내보내기
│       ├── rules/              # 호환성 규칙 (모듈화)
│       │   ├── index.ts        # 규칙 집계
│       │   ├── auth.ts         # 인증 규칙
│       │   ├── data.ts         # 데이터 무결성 규칙
│       │   ├── naming.ts       # 명명 및 키워드 규칙
│       │   ├── privilege.ts    # 권한 규칙
│       │   ├── schema.ts       # 스키마 규칙
│       │   ├── storage.ts      # 스토리지 엔진 규칙
│       │   └── sysvar.ts       # 시스템 변수 규칙
│       └── parsers/            # SQL 파서
│           ├── table-parser.ts # CREATE TABLE 파서
│           ├── user-parser.ts  # CREATE USER/GRANT 파서
│           └── server-result-parser.ts
├── dist/                       # 빌드 출력
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 기술 스택

| 기술 | 용도 |
|------|------|
| **TypeScript** | 타입 안전 개발 |
| **Vite** | 빠른 빌드 및 HMR |
| **Vitest** | 단위 테스트 (288개 테스트) |
| **Vanilla JS/CSS** | 프레임워크 의존성 없음 |
| **File API** | 클라이언트 사이드 파일 읽기 |
| **Blob API** | 파일 다운로드 생성 |

### 데이터 흐름

```
파일 선택
    ↓
FileAnalyzer.analyzeFiles()
    ↓
규칙 패턴 매칭 (67개 규칙)
    ↓
이슈 생성
    ↓
UIManager.displayResults()
    ↓
리포트 내보내기 (JSON/CSV/MySQL Shell)
```

---

## 💻 개발

### 필수 조건

- Node.js 18 이상
- npm 또는 yarn

### 명령어

```bash
# 의존성 설치
npm install

# 개발 서버 시작 (http://localhost:5173)
npm run dev

# 테스트 실행
npm run test:run

# TypeScript 검사
npx tsc --noEmit

# 프로덕션 빌드
npm run build

# 프로덕션 빌드 미리보기
npm run preview
```

### 테스트 실행

```bash
# 모든 테스트 실행
npm run test:run

# 커버리지와 함께 테스트 실행
npm run test:coverage

# 감시 모드로 테스트 실행
npm run test
```

### 새 규칙 추가

1. 필요한 경우 `constants.ts`에 상수 추가
2. `rules/` 아래의 적절한 파일에 규칙 생성
3. `CompatibilityRule` 인터페이스 따르기:

```typescript
{
  id: 'unique_rule_id',
  type: 'schema' | 'data' | 'config' | 'privilege' | 'query',
  category: 'removedSysVars' | 'newDefaultVars' | 'reservedKeywords' |
            'authentication' | 'invalidPrivileges' | 'invalidObjects' |
            'dataIntegrity',
  pattern: /regex/gi,  // 또는 detectInData/detectInConfig 함수
  severity: 'error' | 'warning' | 'info',
  title: '사람이 읽을 수 있는 제목',
  description: '상세 설명',
  suggestion: '수정 방법',
  mysqlShellCheckId: '동등한MySQLShell검사',
  generateFixQuery: (context) => 'SQL 수정 쿼리'
}
```

4. `__tests__/rules.test.ts`에 테스트 추가

---

## 🔒 보안 및 개인정보

| 항목 | 구현 |
|------|------|
| **데이터 처리** | 100% 클라이언트 사이드, 브라우저 내 |
| **네트워크** | 외부 서버로 데이터 전송 없음 |
| **오프라인 지원** | 인터넷 없이 작동 (로컬 설치) |
| **파일 처리** | File API로 파일 읽기, 업로드 없음 |
| **추적 없음** | 분석, 쿠키 또는 텔레메트리 없음 |

데이터베이스 덤프 파일은 브라우저를 벗어나지 않습니다.

---

## 🤝 기여하기

기여를 환영합니다! 도움을 주실 수 있는 방법:

### 기여 방법

1. **버그 리포트** - 재현 단계와 함께 이슈 열기
2. **기능 요청** - 새로운 호환성 검사 제안
3. **PR 제출** - 코드 개선, 새 규칙, 문서
4. **문서 개선** - README, 인라인 주석, 예제

### PR 제출 전

1. TypeScript 검사 통과 확인 (`npx tsc --noEmit`)
2. 모든 테스트 통과 확인 (`npm run test:run`)
3. 빌드 성공 확인 (`npm run build`)
4. 실제 mysqlsh 덤프로 테스트

### 커밋 컨벤션

```
feat: X에 대한 새 호환성 규칙 추가
fix: Y 감지에서 거짓 양성 수정
docs: Z로 README 업데이트
test: W에 대한 테스트 추가
refactor: 규칙 모듈화 개선
```

---

## 📝 라이선스

MIT 라이선스 - 자유롭게 사용, 수정 및 배포 가능.

---

## 🔗 관련 리소스

- [MySQL 8.4 릴리스 노트](https://dev.mysql.com/doc/relnotes/mysql/8.4/en/)
- [MySQL Shell checkForServerUpgrade()](https://dev.mysql.com/doc/mysql-shell/8.4/en/mysql-shell-utilities-upgrade.html)
- [MySQL 8.4 더 이상 사용되지 않는 기능](https://dev.mysql.com/doc/refman/8.4/en/mysql-nutshell.html)
- [MySQL 8.4 제거된 기능](https://dev.mysql.com/doc/refman/8.4/en/added-deprecated-removed.html)

---

## 📞 지원

이슈 또는 질문이 있으시면:

- **GitHub Issues**: [버그 리포트 또는 기능 요청](https://github.com/sanghyun-io/mysql-upgrade-checker/issues)
- **Discussions**: [질문 또는 아이디어 공유](https://github.com/sanghyun-io/mysql-upgrade-checker/discussions)

---

**⚠️ 면책 조항:** 이 도구는 정적 분석을 통해 주요 호환성 문제를 감지합니다. 프로덕션 데이터베이스를 업그레이드하기 전에 항상 스테이징 환경에서 철저한 테스트를 수행하세요. 일부 검사는 완전한 정확성을 위해 라이브 서버 쿼리가 필요합니다.
