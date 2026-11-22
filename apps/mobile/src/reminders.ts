import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Preferences } from '@capacitor/preferences'

export const nativeIOS = () => Capacitor.getPlatform() === 'ios'
export const REMINDER_ID = 73001
const preferenceKey = 'arize-local-reminder-v1'
export interface LocalReminder { enabled: boolean; time: string }
export function timeParts(time: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid time.')
  const [hour, minute] = time.split(':').map(Number)
  return { hour, minute }
}
export async function readReminder(): Promise<LocalReminder> {
  if (!nativeIOS()) return { enabled: false, time: '09:00' }
  try {
    const { value } = await Preferences.get({ key: preferenceKey })
    const parsed = JSON.parse(value ?? '{}')
    timeParts(parsed.time)
    const permission = await LocalNotifications.checkPermissions()
    const pending = await LocalNotifications.getPending()
    return { enabled: parsed.enabled === true && permission.display === 'granted' && pending.notifications.some(n => n.id === REMINDER_ID), time: parsed.time }
  } catch { return { enabled: false, time: '09:00' } }
}
export async function enableReminder(time: string) {
  if (!nativeIOS()) throw new Error('Device reminders can be tested in the iOS build, not this browser preview.')
  const on = timeParts(time)
  // Called only by the explicit Enable/Save button, never on launch.
  const permission = await LocalNotifications.requestPermissions()
  if (permission.display !== 'granted') throw new Error('Notifications are off. You can enable them in iOS Settings; this app still works without them.')
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] })
  try {
    await LocalNotifications.schedule({ notifications: [{
      id: REMINDER_ID, title: 'Arize',
      body: 'A little space for you. Open Arize when you have a moment.',
      schedule: { on, repeats: true },
    }] })
    await Preferences.set({ key: preferenceKey, value: JSON.stringify({ enabled: true, time }) })
  } catch (error) {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => undefined)
    throw error
  }
}
export async function disableReminder(time: string) {
  if (!nativeIOS()) return
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] })
  const delivered = await LocalNotifications.getDeliveredNotifications()
  await LocalNotifications.removeDeliveredNotifications({ notifications: delivered.notifications.filter(n => n.id === REMINDER_ID) })
  await Preferences.set({ key: preferenceKey, value: JSON.stringify({ enabled: false, time }) })
}
