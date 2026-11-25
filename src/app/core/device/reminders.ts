import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface Reminder {
  readonly id: number;
  readonly at: Date;
  readonly title: string;
  readonly text: string;
}

/** Port: notifications at a given time; in the apps also while the app is closed. */
export abstract class Reminders {
  /** Asks for permission if needed. False if the user does not want any. */
  abstract schedule(reminders: readonly Reminder[]): Promise<boolean>;
  abstract cancel(ids: readonly number[]): Promise<void>;
}

@Injectable()
export class DeviceReminders extends Reminders {
  async schedule(reminders: readonly Reminder[]): Promise<boolean> {
    try {
      let { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') ({ display } = await LocalNotifications.requestPermissions());
      if (display !== 'granted') return false;
      await LocalNotifications.schedule({
        notifications: reminders.map(({ id, at, title, text }) => ({
          id,
          title,
          body: text,
          schedule: { at, allowWhileIdle: true },
        })),
      });
      return true;
    } catch (error) {
      console.warn('Notifications not available', error);
      return false;
    }
  }

  async cancel(ids: readonly number[]): Promise<void> {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) }).catch(
      () => undefined,
    );
  }
}
