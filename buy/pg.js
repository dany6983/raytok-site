/* 결제(PG) 상수 — **이 파일 하나만** 바꾸면 운영 전환이 끝난다.
 *
 * 왜 한 자리인가 (AGENTS §4): 전에는 `buy/index.html` 안에 두 상수가 박혀 있었고,
 * 같은 값을 읽는 곳이 넷이었다(선언 · requestPayment · docs/pg-switchover.md · 시험).
 * 전환하는 사람이 넷 중 하나를 빠뜨리면 **테스트 채널로 실결제를 받는다.**
 * 그래서 값은 여기서만 만들고 나머지는 모두 이 파일을 읽는다.
 *
 * 전환 방법 (대표님):
 *   포트원 콘솔 → 결제 연동 → **KCP 채널** 에서 두 값을 복사해 아래 두 줄에 붙인다.
 *   그 외에 손댈 곳은 없다. `isTest` 는 값에서 저절로 갈린다.
 *
 * ⚠ storeId·channelKey 는 브라우저가 그대로 들고 쓰는 **공개 식별자**다(비밀값이 아니다).
 *    비밀값은 서버 쪽 `PORTONE_API_SECRET`·`PORTONE_WEBHOOK_SECRET` 이고, 그것은 이
 *    저장소에 **절대 들어오지 않는다**(Worker secret 에만).
 */
(function (global) {
  'use strict';

  var PG = {
    /* 포트원 콘솔의 상점 아이디. 운영값 형식: store-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx */
    storeId: 'store-raytok-test',

    /* 포트원 콘솔의 채널 키(KCP). 운영값 형식: channel-key-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx */
    channelKey: 'channel-key-1319ee61-bc5e-4ee0-8e1c-68b9db4d5551',

    /* 어느 PG 를 쓰는 채널인지 — 바꿀 때 눈으로 한 번 더 보는 칸 */
    provider: 'kcp'
  };

  /* 테스트 채널인가 — **값에서** 갈린다. 사람이 따로 켜고 끄는 깃발을 두지 않는다
     (깃발과 값이 어긋나면 테스트 채널로 실결제를 받거나 그 반대가 된다). */
  PG.isTest = /test/i.test(String(PG.storeId)) || /test/i.test(String(PG.channelKey));

  /* 값이 다 있나 — 하나라도 비면 결제창을 열지 않고 사람에게 알린다(§20 빈 답). */
  PG.ready = function () {
    return !!(PG.storeId && PG.channelKey) &&
           !/^<|>$/.test(String(PG.storeId)) && !/^<|>$/.test(String(PG.channelKey));
  };

  global.rtPG = PG;
  if (typeof module !== 'undefined' && module.exports) module.exports = PG;
})(typeof window !== 'undefined' ? window : globalThis);
