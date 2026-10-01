import { Suspense } from 'react'
import AuthCard from '@/components/auth/AuthCard'

export default function SignInPage() {
  return <Suspense><AuthCard mode="sign-in" /></Suspense>
}
