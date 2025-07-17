import { formatDistance, formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { enUS, es, fr, da, de, he, it, ja, ko, nl, pl, ptBR, ru, zhCN } from 'date-fns/locale'

const localeMap = {
    da,
    de,
    en: enUS,
    'en-US': enUS,
    es: es,
    'es-ES': es,
    'es-US': es,
    fr,
    'fr-CA': fr,
    'fr-EU': fr,
    he,
    it,
    ja,
    ko,
    nl,
    pl,
    'pt-BR': ptBR,
    ru,
    'zh': zhCN,
    'zh-CN': zhCN,
}


export function useFormatDistance() {
    const { i18n } = useTranslation()
    const lang = i18n.language as keyof typeof localeMap
    const locale = localeMap[lang] ?? localeMap.en
    function formatDistanceWithI18n(dateA: Date, dateB: Date, options = {}) {
        
        return formatDistance(dateA, dateB, { locale, ...options })
    }

    function formatDistanceToNowWithI18n(date: Date, options = {}) {
        return formatDistanceToNow(date, { locale, ...options })
    }

    return { formatDistanceWithI18n, formatDistanceToNowWithI18n }
}

export function formatDistanceWithI18n(
    dateA: Date,
    dateB: Date,
    lang: string,
    options = {}
    ) {
    const locale = localeMap[lang as keyof typeof localeMap] ?? localeMap.en
    return formatDistance(dateA, dateB, { locale, ...options })
}