import { emitServiceChatUpdated, emitWalletUpdated } from "../../realtime/socket.server.js";
import { sendExpoPushToUsers } from "../notifications/notifications.service.js";
import {
  recordComponentFailure,
  recordComponentStarting,
  recordComponentSuccess,
} from "../monitoring/monitoring.service.js";
import { queueImmediatePixPayout } from "../payouts/payout.service.js";
import { releaseDueCommercialSettlements } from "./earnings-release.service.js";

const RELEASE_INTERVAL_MS = 60_000;

let interval = null;
let running = null;

async function runReleaseCycle() {
  if (running) {
    return running;
  }

  running = releaseDueCommercialSettlements()
    .then(async ({ failed, released }) => {
      for (const result of released) {
        emitWalletUpdated({
          transactionId: result.transactionId,
          userIds: result.walletUserIds,
        });
        try {
          await queueImmediatePixPayout(result.transactionId);
        } catch (error) {
          recordComponentFailure("earnings-release-payout", error, {
            transactionId: result.transactionId,
          });
        }
        if (result.service) {
          emitServiceChatUpdated({ ...result.service, reason: "service-funds-released" });
          try {
            await sendExpoPushToUsers({
              title: "Valor do servico liberado",
              body: "O prazo de protecao terminou. Consulte na carteira os valores liberados e, quando houver, o status do repasse Pix.",
              channelId: "messages",
              data: { screen: "ServiceConversation", conversationId: result.service.conversationId, reason: "service-funds-released" },
              userIds: [result.service.customerUserId, result.service.sellerUserId].filter(Boolean),
            });
          } catch (error) {
            recordComponentFailure("earnings-release-notification", error, { transactionId: result.transactionId });
          }
        }
      }

      for (const failure of failed) {
        recordComponentFailure("earnings-release", failure.error, {
          transactionId: failure.transactionId,
        });
      }

      if (failed.length === 0) {
        recordComponentSuccess("earnings-release", { released: released.length });
      }
    })
    .catch((error) => {
      recordComponentFailure("earnings-release", error);
    })
    .finally(() => {
      running = null;
    });

  return running;
}

export function startEarningsReleaseWorker() {
  if (interval) {
    return;
  }

  recordComponentStarting("earnings-release");
  void runReleaseCycle();
  interval = setInterval(() => void runReleaseCycle(), RELEASE_INTERVAL_MS);
  interval.unref?.();
}

export async function stopEarningsReleaseWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }

  await running;
}
