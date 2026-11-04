import { ProfilePicker } from '@/components/profile/profile-picker'
import { getCurrentUser } from '@/lib/auth/user'
import { listProfiles } from '@/lib/profiles'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const user = await getCurrentUser()
  return <ProfilePicker profiles={listProfiles(user.name)} />
}
