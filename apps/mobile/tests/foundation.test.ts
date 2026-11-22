import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { disableReminder, enableReminder, nativeIOS, readReminder, timeParts } from '../src/reminders.ts'
test('local time parser allows a daily hour/minute but no invalid or injected value', () => {
  assert.deepEqual(timeParts('09:30'), { hour: 9, minute: 30 })
  assert.deepEqual(timeParts('23:59'), { hour: 23, minute: 59 })
  for (const value of ['', '24:00', '12:60', '9:30', '09:30:00', '09:30<script>']) assert.throws(() => timeParts(value))
})
test('web preview cannot request native permission, schedule or persist a device reminder', async () => {
  assert.equal(nativeIOS(), false)
  assert.deepEqual(await readReminder(), { enabled: false, time: '09:00' })
  await assert.rejects(enableReminder('09:00'), /iOS build/)
  await disableReminder('09:00')
})
test('native reminder stores only opt-in/time, uses a stable cancellable ID and generic text', () => {
  const source = readFileSync(new URL('../src/reminders.ts', import.meta.url), 'utf8')
  assert.match(source, /REMINDER_ID = 73001/)
  assert.match(source, /JSON\.stringify\(\{ enabled: true, time \}\)/)
  assert.match(source, /LocalNotifications\.cancel/)
  assert.doesNotMatch(source, /userId|token|journal|mood|diagnosis|subscription|fetch\(/i)
})
test('privacy declaration is included as an Xcode resource and config has no remote app URL', () => {
  const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  assert.match(read('ios/App/App/PrivacyInfo.xcprivacy'), /CA92\.1/)
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /PrivacyInfo\.xcprivacy in Resources/)
  assert.doesNotMatch(read('capacitor.config.ts'), /server:\s*\{|https:\/\//)
})
