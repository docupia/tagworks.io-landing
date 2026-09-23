# TagWorks landing

TagWorks의 제품 계획을 바탕으로 만든 한국어 랜딩 페이지입니다. 카키와 파스텔 신호색으로 HTML 공개, 고정 링크, 방문 흐름 분석을 설명합니다.

## 로컬 미리보기

```sh
cd site
python3 -m http.server 4173 --directory dist
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다.

## 구성

- `site/dist/index.html`: 페이지 구조와 한국어 콘텐츠
- `site/dist/styles.css`: 반응형 디자인과 접근성 스타일
- `site/dist/script.js`: 스크롤 효과와 분석 필터 데모
- `site/.openai/hosting.json`: 정적 사이트 게시 설정

현재 구현은 제품 소개용 랜딩 페이지입니다. 계획서의 Supabase 인증, HTML 업로드·정제, 실제 게시와 통계 백엔드는 포함하지 않습니다.
