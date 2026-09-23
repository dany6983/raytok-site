# RayTok 기록 해시 체인 규칙 v1
## 1. 원칙
- 항목은 추가만. 정정은 새 항목(kind=replace), 원 항목 유지
- n = 1부터 +1. 빠진 번호 = 제거된 것
- hash = SHA-256( prev + "\n" + 정규화(항목에서 hash 뺀 것) ). 첫 항목 prev = "0"×64
## 2. 항목 형식
공통: n(정수) ts(unix ms 정수) kind prev hash. kind별:
begin{session,host,lang} · line{seq,src,text,tr{lang:text},via} · tr{seq,tr} · replace{seq,text,tr,via} · join{dev,name,lang} · leave{dev,why} · gap{dev,from,to} · gap_fill{dev,from,to} · note{text} · end{lines,minutes,joined_max}
값: 정수·문자열·불·null·객체·배열만. 소수 금지. 키는 ASCII 소문자+밑줄.
## 3. 정규화
① hash 제거(prev 포함) ② 키 바이트 순 정렬, 중첩 객체 재귀, 배열 순서 유지 ③ 공백 없이 , : ④ 비ASCII 이스케이프 안 함 ⑤ UTF-8 바이트
JS: JSON.stringify(sortKeysDeep(obj))
## 4. 해시
입력 = prev(64 hex 소문자) + "\n" + 정규화 문자열 → SHA-256 → 64자 소문자 hex. 브라우저 crypto.subtle / node crypto.
## 5. 파일
{"ver":1,"session":{"code","host","lang","started"},"items":[...],"last":"<마지막 hash>"}
검증: ① n 1..N 연속 ② items[0].prev == 0×64 ③ 각 hash 재계산 일치 ④ 각 prev == 직전 hash ⑤ last == 마지막 hash. 틀리면 첫 번째 틀린 n 표시. gap 있고 gap_fill 없는 구간 목록 표시.
## 6. 시험 벡터
n=1 {"host":"F971N","kind":"begin","lang":"ko","n":1,"prev":"0"×64,"session":"483921","ts":1758500000000}
 → b548e37f94be51d5922d4d528d61b72be1b64912d654d385a46f9095fff55bdd
n=2 {"kind":"line","n":2,"prev":<n1 hash>,"seq":1,"src":"ko","text":"안전모를 쓰세요","tr":{"en":"Wear a helmet","vi":"Hãy đội mũ bảo hiểm"},"ts":1758500003000,"via":""}
 → f6d03d6584553c373423ea0bfe224666013b1a8c533dae3932e62b774e6c3489
n=3 {"dev":"a1b2c3","kind":"join","lang":"vi","n":3,"name":"","prev":<n2>,"ts":1758500004000}
 → 61c80817f9498a6da7e595035314797b4a2e6e7a0f8718caaceefaf7ddbdfa2f
n=4 {"dev":"a1b2c3","from":2,"kind":"gap","n":4,"prev":<n3>,"to":4,"ts":1758500010000}
 → 7af2254f48d36f0fa6200f9b0fa05b9ea34641b9b5018178b2b7553d2c7d2a06
n=5 {"joined_max":1,"kind":"end","lines":1,"minutes":0,"n":5,"prev":<n4>,"ts":1758500020000}
 → a4435d240a9462b6a78adc2145d0ca11155a186fb76f6e78d362696edf73423e = last
