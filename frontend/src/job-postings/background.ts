import { browser } from "wxt/browser";
import { createPostingHandler } from "./background-handler";
import { LocalPostingRepository } from "./repository";
import { PostingService } from "./service";
const ALARM_NAME = "careerForm.jobPostings.next";
export function installPostingBackground() {
  const service = new PostingService(
    new LocalPostingRepository(browser.storage.local),
    {
      now: Date.now,
      id: () => crypto.randomUUID(),
      permission: async () =>
        (await browser.notifications.getPermissionLevel()) === "granted",
      schedule: async (at) => {
        if (at === undefined) {
          await browser.alarms.clear(ALARM_NAME);
          return;
        }
        await browser.alarms.create(ALARM_NAME, { when: at });
      },
      notify: async (delivery) => {
        await browser.notifications.create(delivery.id, {
          type: "basic",
          iconUrl: `chrome-extension://${browser.runtime.id}/side-panel-launcher-logo.png`,
          title: delivery.title,
          message: delivery.message,
          buttons: [{ title: "지원하기" }],
        });
      },
      clearNotification: async (id) => {
        await browser.notifications.clear(id);
      },
    },
  );
  const recover = () => {
    void service.recover().catch(() => undefined);
  };
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) recover();
  });
  browser.runtime.onStartup.addListener(recover);
  browser.runtime.onInstalled.addListener(recover);
  browser.notifications.onPermissionLevelChanged.addListener(recover);
  const openPosting = (id: string) => {
    if (!id.startsWith("careerForm.job.")) return;
    void service
      .notificationUrl(id)
      .then(async (url) => {
        if (url) await browser.tabs.create({ url });
        await browser.notifications.clear(id);
      })
      .catch(() => undefined);
  };
  browser.notifications.onClicked.addListener(openPosting);
  browser.notifications.onButtonClicked.addListener((id, index) => {
    if (index === 0) openPosting(id);
  });
  // Register listeners synchronously before restoring persisted jobs.
  recover();
  return createPostingHandler(service, browser.runtime.id, (hash) =>
    browser.tabs.create({
      url: `chrome-extension://${browser.runtime.id}/options.html` + hash,
    }),
  );
}
