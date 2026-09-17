/**
 * @vitest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CookieBanner from '../CookieBanner'

const CONSENT_KEY = 'c2_analytics_consent'

describe('CookieBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('standalone context (window.parent === window)', () => {
    it('renders banner when no consent is stored', () => {
      render(<CookieBanner />)
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText(/Cookie Consent/)).toBeInTheDocument()
    })

    it('saves consent and fires event on accept', async () => {
      const user = userEvent.setup()
      const eventListener = vi.fn()
      window.addEventListener('cookie-consent-changed', eventListener)

      render(<CookieBanner />)
      const acceptButton = screen.getByRole('button', { name: /Accept/ })

      await act(async () => {
        await user.click(acceptButton)
      })

      const storedConsent = JSON.parse(localStorage.getItem(CONSENT_KEY) || '{}')
      expect(storedConsent.analytics).toBe(true)
      expect(storedConsent.timestamp).toBeDefined()
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { consented: true },
        })
      )

      window.removeEventListener('cookie-consent-changed', eventListener)
    })

    it('saves non-consent and fires event on decline', async () => {
      const user = userEvent.setup()
      const eventListener = vi.fn()
      window.addEventListener('cookie-consent-changed', eventListener)

      render(<CookieBanner />)
      const declineButton = screen.getByRole('button', { name: /Decline/ })

      await act(async () => {
        await user.click(declineButton)
      })

      const storedConsent = JSON.parse(localStorage.getItem(CONSENT_KEY) || '{}')
      expect(storedConsent.analytics).toBe(false)
      expect(storedConsent.timestamp).toBeDefined()
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { consented: false },
        })
      )

      window.removeEventListener('cookie-consent-changed', eventListener)
    })

    it('does not show banner when valid consent already stored', () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: true, timestamp: Date.now() }))
      render(<CookieBanner />)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  describe('embedded context (window.parent !== window)', () => {
    let mockParent: MessageEventSource

    beforeEach(() => {
      mockParent = {} as MessageEventSource
      Object.defineProperty(window, 'parent', {
        value: mockParent,
        configurable: true,
      })
    })

    afterEach(() => {
      Object.defineProperty(window, 'parent', {
        value: window,
        configurable: true,
      })
    })

    it('banner starts hidden (no consent, no reset message)', () => {
      render(<CookieBanner />)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('banner shows after receiving RESET_INITIAL_BUILD_HIDE from parent', () => {
      render(<CookieBanner />)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

      act(() => {
        const event = new MessageEvent('message', {
          data: { type: 'RESET_INITIAL_BUILD_HIDE' },
          source: mockParent,
        })
        window.dispatchEvent(event)
      })

      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('ignores RESET_INITIAL_BUILD_HIDE from non-parent source', () => {
      render(<CookieBanner />)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

      act(() => {
        const event = new MessageEvent('message', {
          data: { type: 'RESET_INITIAL_BUILD_HIDE' },
          source: window, // Wrong source
        })
        window.dispatchEvent(event)
      })

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('ignores other message types', () => {
      render(<CookieBanner />)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

      act(() => {
        const event = new MessageEvent('message', {
          data: { type: 'SOME_OTHER_MESSAGE' },
          source: mockParent,
        })
        window.dispatchEvent(event)
      })

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('stays visible across a remount after RESET_INITIAL_BUILD_HIDE (survives iframe remount)', () => {
      const { unmount } = render(<CookieBanner />)

      act(() => {
        const event = new MessageEvent('message', {
          data: { type: 'RESET_INITIAL_BUILD_HIDE' },
          source: mockParent,
        })
        window.dispatchEvent(event)
      })
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()

      unmount()
      render(<CookieBanner />)

      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('starts hidden on a fresh mount after INITIAL_BUILD_COMPLETE, even across a remount', () => {
      const { unmount } = render(<CookieBanner />)

      act(() => {
        const resetEvent = new MessageEvent('message', {
          data: { type: 'RESET_INITIAL_BUILD_HIDE' },
          source: mockParent,
        })
        window.dispatchEvent(resetEvent)
      })
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()

      act(() => {
        const completeEvent = new MessageEvent('message', {
          data: { type: 'INITIAL_BUILD_COMPLETE' },
          source: mockParent,
        })
        window.dispatchEvent(completeEvent)
      })
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

      unmount()
      render(<CookieBanner />)

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })
})
