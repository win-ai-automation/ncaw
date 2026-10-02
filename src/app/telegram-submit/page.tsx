import type { Metadata } from 'next'
import TelegramSubmitForm from './telegram-submit-form'

export const metadata: Metadata = {
  title: 'Submit content | Netfintax',
  description: 'Submit a source to the Netfintax content workflow from Telegram.',
}

export default function TelegramSubmitPage() {
  return <TelegramSubmitForm />
}
