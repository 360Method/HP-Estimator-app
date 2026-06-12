/**
 * OsChat — the HP intelligence inside the OS shell. Mounts the same chat
 * surface as /admin/chat; the conversation history, tools, and approvals
 * flow are shared. Scope-aware chat (open from a client room or document)
 * lands with the Phase 2 rooms.
 */
import { OsShell } from "../OsShell";
import { IntegratorChatInner } from "@/pages/admin/IntegratorChat";

export default function OsChat() {
  return (
    <OsShell active="/os/chat" fill>
      <IntegratorChatInner />
    </OsShell>
  );
}
