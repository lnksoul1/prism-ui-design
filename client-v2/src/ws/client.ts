import { useDesignStore } from "../stores/design";
import type { DesignStateView } from "../types";

interface ChangeMessage {
  type: "change";
  state: DesignStateView;
}
interface OtherMessage {
  type: string;
  [key: string]: unknown;
}
type ServerMessage = ChangeMessage | OtherMessage;

function isChangeMessage(msg: ServerMessage): msg is ChangeMessage {
  return msg.type === "change" && !!msg.state;
}

export function connectPrismSocket(url = `ws://${location.host}/ws`): () => void {
  const { applyServerState, setConnected } = useDesignStore.getState();
  let ws: WebSocket | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const open = (): void => {
    ws = new WebSocket(url);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      if (!closed) retryTimer = setTimeout(open, 1500); // 指数退避可后续加强
    };
    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      // 服务端 change 广播自带全量 state（src/index.ts:719-725）
      if (isChangeMessage(msg)) applyServerState(msg.state);
    };
  };
  open();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}
