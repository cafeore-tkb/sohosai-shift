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

// カレンダー配信（個人TT）の購読用 Worker の URL（worker/。例："https://sohosai-shift.xxxx.workers.dev"）。
// 空なら、閲覧ページ（#cal=…）は「ファイルで取り込む」だけを出す。
window.SHIFT_CALENDAR = {
  feedBase: "https://sohosai-shift.cafeore.workers.dev",
};
