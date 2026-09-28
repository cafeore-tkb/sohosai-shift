// 共同編集用の Firebase 設定（プロジェクト：sohosai-shift／管理アカウント：cafeore2016@gmail.com）。
// 空にすると共同編集は無効になり、従来どおりオフラインで動きます。
// ※ apiKey は公開しても問題ない値です（アクセス制限は firestore.rules で行います）。
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyC6jJKmn8F3hyHzvJ-l-FQ00mUcRJRQ7MY",
  authDomain: "sohosai-shift.firebaseapp.com",
  projectId: "sohosai-shift",
  storageBucket: "sohosai-shift.firebasestorage.app",
  messagingSenderId: "27330219246",
  appId: "1:27330219246:web:816744e9296928c9d1f7ff",
};

// 公開サイト（https://sohosai-shift.cafeore.workers.dev）の本番の共同編集の部屋。/edit で開き、カレンダー配信は /shift。
// 空なら /edit・/shift は使わず、共同編集は今までどおり「共同編集を始める」で作った部屋（#room=…）。
window.SHIFT_SITE = {
  room: "3uHViyjAK1PM9wWLl1MBAE3k",
};
