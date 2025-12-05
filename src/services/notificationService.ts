import { LocalNotifications } from '@capacitor/local-notifications';

export interface NotificationSettings {
    enabled: boolean;
    frequency: '2h' | '4h' | 'daily';
}

const NOTIFICATION_ID_BASE = 1000;

export const requestNotificationPermissions = async (): Promise<boolean> => {
    try {
        const result = await LocalNotifications.requestPermissions();
        return result.display === 'granted';
    } catch (error) {
        console.error("Error requesting permissions:", error);
        return false;
    }
};

export const scheduleGoalReminder = async (
    settings: NotificationSettings,
    listedCount: number,
    dailyGoal: number = 10
) => {
    // Cancel existing notifications first
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID_BASE }] });

    if (!settings.enabled) return;

    // Don't notify if goal is met
    if (listedCount >= dailyGoal) return;

    const title = "Keep Crushing It! 🚀";
    const body = `You've listed ${listedCount}/${dailyGoal} items today. Get back to it!`;

    let scheduleAt = new Date();

    if (settings.frequency === 'daily') {
        // Schedule for 6 PM today (or tomorrow if it's already past 6 PM)
        scheduleAt.setHours(18, 0, 0, 0);
        if (scheduleAt.getTime() < Date.now()) {
            scheduleAt.setDate(scheduleAt.getDate() + 1);
        }
    } else {
        // Schedule for X hours from now
        const hours = settings.frequency === '2h' ? 2 : 4;
        scheduleAt.setHours(scheduleAt.getHours() + hours);
    }

    await LocalNotifications.schedule({
        notifications: [
            {
                title,
                body,
                id: NOTIFICATION_ID_BASE,
                schedule: { at: scheduleAt },
                sound: undefined,
                attachments: undefined,
                actionTypeId: "",
                extra: null
            }
        ]
    });

    console.log(`Notification scheduled for: ${scheduleAt.toLocaleString()}`);
};

export const cancelAllNotifications = async () => {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
    }
};
