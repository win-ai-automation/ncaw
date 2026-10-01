'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { Check, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password'
type FieldName = 'fullName' | 'email' | 'password' | 'confirmPassword'
type FieldErrors = Partial<Record<FieldName, string>>

const copy = {
  'sign-in': { title: 'Welcome back', subtitle: 'Sign in to continue to your content workspace.', action: 'Sign in' },
  'sign-up': { title: 'Create your account', subtitle: 'Join the Netfintax content operations workspace.', action: 'Create account' },
  'forgot-password': { title: 'Forgot your password?', subtitle: 'Enter your email and we will send you a secure reset link.', action: 'Send reset link' },
  'reset-password': { title: 'Set a new password', subtitle: 'Choose a strong password you have not used before.', action: 'Update password' },
} satisfies Record<Mode, { title: string; subtitle: string; action: string }>

export default function AuthCard({ mode }: { mode: Mode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => searchParams.get('error') ?? '')
  const [success, setSuccess] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [fieldTouched, setFieldTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const details = copy[mode]
  const needsEmail = mode !== 'reset-password'
  const needsPassword = mode !== 'forgot-password'

  function getFieldError(field: FieldName, value?: string) {
    const currentValue = value ?? { fullName, email, password, confirmPassword }[field]
    if (field === 'fullName' && mode === 'sign-up') {
      if (!currentValue.trim()) return 'Full name is required.'
      if (currentValue.trim().length < 2) return 'Full name must contain at least 2 characters.'
    }
    if (field === 'email' && needsEmail) {
      if (!currentValue.trim()) return 'Email address is required.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentValue.trim())) return 'Enter a valid email address.'
    }
    if (field === 'password' && needsPassword) {
      if (!currentValue) return 'Password is required.'
      if (currentValue.length < 8) return 'Password must be at least 8 characters.'
    }
    if (field === 'confirmPassword' && (mode === 'sign-up' || mode === 'reset-password')) {
      if (!currentValue) return 'Please confirm your password.'
      if (currentValue !== password) return 'Passwords do not match.'
    }
    return ''
  }

  function validateField(field: FieldName, value?: string) {
    const message = getFieldError(field, value)
    setFieldErrors((current) => {
      const next = { ...current }
      if (message) next[field] = message
      else delete next[field]
      return next
    })
  }

  function touchAndValidate(field: FieldName, value?: string) {
    const isEmpty = field === 'password' || field === 'confirmPassword'
      ? !value
      : !value?.trim()

    if (isEmpty && !hasSubmitted) {
      setFieldErrors((current) => {
        const next = { ...current }
        delete next[field]
        return next
      })
      return
    }
    setFieldTouched((current) => ({ ...current, [field]: true }))
    validateField(field, value)
  }

  function validateForm() {
    setHasSubmitted(true)
    const next: FieldErrors = {}
    const fields: FieldName[] = []
    if (mode === 'sign-up') fields.push('fullName')
    if (needsEmail) fields.push('email')
    if (needsPassword) fields.push('password')
    if (mode === 'sign-up' || mode === 'reset-password') fields.push('confirmPassword')
    fields.forEach((field) => {
      const message = getFieldError(field)
      if (message) next[field] = message
    })
    setFieldTouched((current) => {
      const next = { ...current }
      fields.forEach((field) => { next[field] = true })
      return next
    })
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!validateForm()) return
    setLoading(true)
    const supabase = createClient()
    try {
      if (mode === 'sign-in') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
        const next = searchParams.get('next')
        router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/')
        router.refresh()
      } else if (mode === 'sign-up') {
        const { error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` } })
        if (authError) throw authError
        setSuccess('Account created. Check your email to confirm your address, then sign in.')
      } else if (mode === 'forgot-password') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password` })
        if (authError) throw authError
        setSuccess('If an account exists for this email, a password reset link has been sent.')
      } else {
        const { error: authError } = await supabase.auth.updateUser({ password })
        if (authError) throw authError
        setSuccess('Your password has been updated. Redirecting to the dashboard…')
        window.setTimeout(() => { router.replace('/'); router.refresh() }, 1000)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page">
    <div className="auth-brand"><img src="/logos/netfintax.png" alt="Netfintax" /></div>
    <section className="auth-card">
      <header><h1>{details.title}</h1><p>{details.subtitle}</p></header>
      {success && <div className="auth-message success"><Check /><span>{success}</span></div>}
      {error && <div className="auth-message error"><span>!</span><span>{error}</span></div>}
      <form onSubmit={submit} noValidate>
        {mode === 'sign-up' && <label>Full name<div className={`auth-input ${fieldErrors.fullName ? 'has-error' : ''}`}><UserRound /><input autoComplete="name" value={fullName} onChange={(event) => { setFullName(event.target.value); if (fieldTouched.fullName) validateField('fullName', event.target.value) }} onBlur={(event) => touchAndValidate('fullName', event.target.value)} aria-invalid={Boolean(fieldErrors.fullName)} aria-describedby="full-name-error" placeholder="Your full name" /></div>{fieldErrors.fullName && <span className="auth-field-error" id="full-name-error">{fieldErrors.fullName}</span>}</label>}
        {needsEmail && <label>Email address<div className={`auth-input ${fieldErrors.email ? 'has-error' : ''}`}><Mail /><input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); if (fieldTouched.email) validateField('email', event.target.value) }} onBlur={(event) => touchAndValidate('email', event.target.value)} aria-invalid={Boolean(fieldErrors.email)} aria-describedby="email-error" placeholder="name@company.com" /></div>{fieldErrors.email && <span className="auth-field-error" id="email-error">{fieldErrors.email}</span>}</label>}
        {needsPassword && <label>{mode === 'reset-password' ? 'New password' : 'Password'}<div className={`auth-input ${fieldErrors.password ? 'has-error' : ''}`}><LockKeyhole /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => { setPassword(event.target.value); if (fieldTouched.password) validateField('password', event.target.value); if (fieldTouched.confirmPassword) setFieldErrors((current) => ({ ...current, confirmPassword: !confirmPassword ? 'Please confirm your password.' : confirmPassword !== event.target.value ? 'Passwords do not match.' : undefined })) }} onBlur={(event) => touchAndValidate('password', event.target.value)} aria-invalid={Boolean(fieldErrors.password)} aria-describedby="password-error" placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div>{fieldErrors.password && <span className="auth-field-error" id="password-error">{fieldErrors.password}</span>}</label>}
        {(mode === 'sign-up' || mode === 'reset-password') && <label>Confirm password<div className={`auth-input ${fieldErrors.confirmPassword ? 'has-error' : ''}`}><LockKeyhole /><input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); if (fieldTouched.confirmPassword) validateField('confirmPassword', event.target.value) }} onBlur={(event) => touchAndValidate('confirmPassword', event.target.value)} aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby="confirm-password-error" placeholder="Enter the password again" /><button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}>{showConfirmPassword ? <EyeOff /> : <Eye />}</button></div>{fieldErrors.confirmPassword && <span className="auth-field-error" id="confirm-password-error">{fieldErrors.confirmPassword}</span>}</label>}
        {mode === 'sign-in' && <div className="auth-form-options"><label className="remember"><input type="checkbox" /> Remember me</label><Link href="/auth/forgot-password">Forgot password?</Link></div>}
        <button className="auth-submit" disabled={loading}>{loading ? 'Please wait…' : details.action}</button>
      </form>
      <footer>
        {mode === 'sign-in' && <p>New to Netfintax? <Link href="/auth/sign-up">Create an account</Link></p>}
        {mode === 'sign-up' && <p>Already have an account? <Link href="/auth/sign-in">Sign in</Link></p>}
        {(mode === 'forgot-password' || mode === 'reset-password') && <p><Link href="/auth/sign-in">Back to sign in</Link></p>}
      </footer>
    </section>
  </main>
}
