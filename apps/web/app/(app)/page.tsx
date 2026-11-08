import { connection } from 'next/server'
import { ProfilePicker } from '@/components/profile/profile-picker'
import { getCurrentUser } from '@/lib/auth/user'
import { listProfiles } from '@/lib/profiles'

export default async function ProfilePage() {
  await connection()
  const user = await getCurrentUser()
  return <ProfilePicker profiles={listProfiles(user.name)} />
}
