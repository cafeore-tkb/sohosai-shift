// トーストの場所（下の中央、ステータスバーの上）：#toast と、移動中だけその横に出る「キャンセル」。
// 契約（spec §8.1）：#toast は常に DOM にあり、非表示は hidden。表示のたびに中身を作り直す（key＝toast.id）。
// textContent は「メッセージ＋アクションの文言」だけ。アクションが最初の <button>。キャンセルは #toast の外。

import { actions, store, useUi } from "../../store";
import { Button, MOD_KEY, ToastDockView, ToastView, toastDockButtonClass } from "../components";

export function ToastDock() {
  const toast = useUi((u) => u.toast);
  const visible = useUi((u) => u.toastVisible);
  const move = toast?.variant === "move";
  const action = toast?.action,
    extra = toast?.extra;
  // 勤務状況チェックは表の横に開く（モーダルではない）ので、トーストは表の側に出す
  const besideDrawer = useUi((u) => u.auditOpen);
  return (
    <ToastDockView besideDrawer={besideDrawer}>
      <ToastView
        id="toast"
        visible={visible}
        contentKey={toast?.id}
        message={toast?.message}
        variant={move ? "move" : "default"}
        action={
          action
            ? {
                label: action.label,
                icon: "undo",
                // ⌘Z が効くのは割当の「元に戻す」だけ（旧版と同じ）
                title: action.run === actions.undoLastChange ? `${action.label}（${MOD_KEY}Z）` : undefined,
                onClick: () => {
                  store.hideToast();
                  action.run();
                },
              }
            : undefined
        }
        extra={
          extra
            ? {
                label: extra.label,
                icon: "lock",
                title: "動かしたコマを固定します（自動割当で変えません）",
                onClick: () => {
                  store.hideToast();
                  extra.run();
                },
              }
            : undefined
        }
        onClose={move ? undefined : () => store.hideToast()}
      />
      {visible && move ? (
        <Button variant="secondary" className={toastDockButtonClass} kbd="Esc" onClick={actions.cancelMove}>
          キャンセル
        </Button>
      ) : null}
    </ToastDockView>
  );
}
