import { browser } from "webextension-polyfill-ts"
import { extractDomain } from "../helpers/extract-domain"
import { notification } from "./templates/notification"
import { StorageData } from "../types/types.js"
import { isAlreadyActivated } from "../helpers/is-already-activated"
import { getTracker } from "../helpers/get-tracker"

const currentDomain = extractDomain(location.href)

const saveAsClosed = () => {
  browser.storage.local.get({ closedWebsites: [] }).then(value => {
    const result = value as { closedWebsites: string[] }
    if (!result.closedWebsites.includes(currentDomain)) {
      const updatedClosedWebsites = [...result.closedWebsites].push(currentDomain)
      browser.storage.local.set({ closedWebsites: updatedClosedWebsites })
    }
  })
}

const isCheckoutPage = (location: string) => {
  const checkoutPages = {
    "booking.com": "book.html",
    "etsy.com": "/cart/",
    "aliexpress.com": "/confirm_order.htm",
    "barnesandnoble.com": "/checkout/"
  }
  return (
    currentDomain in checkoutPages &&
    location.includes(checkoutPages[currentDomain as keyof typeof checkoutPages])
  )
}

export const showDonationNotification = () => {
  const getStorageData = browser.storage.local.get({
    activatedAffiliates: [],
    closedWebsites: [],
    disabledWebsites: [],
    partners: []
  }) as Promise<StorageData>

  const getSettings = browser.storage.sync.get({ showNotifications: true }) as Promise<{
    showNotifications: boolean
  }>

  let notificationElement: HTMLElement | null = null

  Promise.all([getStorageData, getTracker, getSettings]).then(([items, tracker, settings]) => {
    const showNotification = () =>
      isAlreadyActivated(items.activatedAffiliates, currentDomain)
        ? notification({
            text: "You are now collecting money for charities with this website.",
            autoclose: true,
            onAutoclose: saveAsClosed,
            onClose: saveAsClosed
          })
        : notification({
            text: "Start raising money for charities with this website by clicking here: ",
            primaryButtonLabel: "Activate donation",
            primaryButtonDestination: `${BASE_URL}/redirect?url=${
              location.href
            }&lang=${browser.i18n.getUILanguage()}&tracker=${tracker}`,
            onClose: saveAsClosed
          })

    if (settings.showNotifications && items.partners.includes(currentDomain)) {
      if (
        !items.closedWebsites.includes(currentDomain) &&
        !items.disabledWebsites.includes(currentDomain)
      ) {
        notificationElement = showNotification()
      }

      if (items.closedWebsites.includes(currentDomain) && isCheckoutPage(location.href)) {
        notificationElement = showNotification()
      }
    }
  })

  const hideWhenClosedOrDisabledInOtherTab = (changes: any) => {
    if (
      changes.closedWebsites &&
      changes.closedWebsites.newValue.includes(currentDomain) &&
      notificationElement
    ) {
      notificationElement.classList.remove("altruisto-notification--in")
    } else if (
      changes.activatedAffiliates &&
      changes.activatedAffiliates.newValue.find(
        (activated: { domain: string; timestamp: number }) => activated.domain === currentDomain
      ) &&
      notificationElement
    ) {
      notificationElement!.classList.remove("altruisto-notification--in")
    }
  }

  // TODO: show notification with confirmation of activated donation in other tabs (second if condition)
  // The problem is that it also displays it in the main tab before reloading, so it looks weird.
  browser.storage.onChanged.addListener(hideWhenClosedOrDisabledInOtherTab)
}
