/** Dial codes for the mobile number field. India is the default. */
export interface Country {
  iso: string
  name: string
  dial: string
}

export const DEFAULT_COUNTRY = 'IN'

export const COUNTRIES: Country[] = [
  { iso: 'AE', name: 'United Arab Emirates', dial: '971' },
  { iso: 'AF', name: 'Afghanistan', dial: '93' },
  { iso: 'AR', name: 'Argentina', dial: '54' },
  { iso: 'AT', name: 'Austria', dial: '43' },
  { iso: 'AU', name: 'Australia', dial: '61' },
  { iso: 'BD', name: 'Bangladesh', dial: '880' },
  { iso: 'BE', name: 'Belgium', dial: '32' },
  { iso: 'BH', name: 'Bahrain', dial: '973' },
  { iso: 'BR', name: 'Brazil', dial: '55' },
  { iso: 'BT', name: 'Bhutan', dial: '975' },
  { iso: 'CA', name: 'Canada', dial: '1' },
  { iso: 'CH', name: 'Switzerland', dial: '41' },
  { iso: 'CL', name: 'Chile', dial: '56' },
  { iso: 'CN', name: 'China', dial: '86' },
  { iso: 'CO', name: 'Colombia', dial: '57' },
  { iso: 'CZ', name: 'Czechia', dial: '420' },
  { iso: 'DE', name: 'Germany', dial: '49' },
  { iso: 'DK', name: 'Denmark', dial: '45' },
  { iso: 'EG', name: 'Egypt', dial: '20' },
  { iso: 'ES', name: 'Spain', dial: '34' },
  { iso: 'ET', name: 'Ethiopia', dial: '251' },
  { iso: 'FI', name: 'Finland', dial: '358' },
  { iso: 'FR', name: 'France', dial: '33' },
  { iso: 'GB', name: 'United Kingdom', dial: '44' },
  { iso: 'GH', name: 'Ghana', dial: '233' },
  { iso: 'GR', name: 'Greece', dial: '30' },
  { iso: 'HK', name: 'Hong Kong', dial: '852' },
  { iso: 'HU', name: 'Hungary', dial: '36' },
  { iso: 'ID', name: 'Indonesia', dial: '62' },
  { iso: 'IE', name: 'Ireland', dial: '353' },
  { iso: 'IL', name: 'Israel', dial: '972' },
  { iso: 'IN', name: 'India', dial: '91' },
  { iso: 'IQ', name: 'Iraq', dial: '964' },
  { iso: 'IR', name: 'Iran', dial: '98' },
  { iso: 'IT', name: 'Italy', dial: '39' },
  { iso: 'JO', name: 'Jordan', dial: '962' },
  { iso: 'JP', name: 'Japan', dial: '81' },
  { iso: 'KE', name: 'Kenya', dial: '254' },
  { iso: 'KH', name: 'Cambodia', dial: '855' },
  { iso: 'KR', name: 'South Korea', dial: '82' },
  { iso: 'KW', name: 'Kuwait', dial: '965' },
  { iso: 'LA', name: 'Laos', dial: '856' },
  { iso: 'LB', name: 'Lebanon', dial: '961' },
  { iso: 'LK', name: 'Sri Lanka', dial: '94' },
  { iso: 'MA', name: 'Morocco', dial: '212' },
  { iso: 'MM', name: 'Myanmar', dial: '95' },
  { iso: 'MV', name: 'Maldives', dial: '960' },
  { iso: 'MX', name: 'Mexico', dial: '52' },
  { iso: 'MY', name: 'Malaysia', dial: '60' },
  { iso: 'NG', name: 'Nigeria', dial: '234' },
  { iso: 'NL', name: 'Netherlands', dial: '31' },
  { iso: 'NO', name: 'Norway', dial: '47' },
  { iso: 'NP', name: 'Nepal', dial: '977' },
  { iso: 'NZ', name: 'New Zealand', dial: '64' },
  { iso: 'OM', name: 'Oman', dial: '968' },
  { iso: 'PE', name: 'Peru', dial: '51' },
  { iso: 'PH', name: 'Philippines', dial: '63' },
  { iso: 'PK', name: 'Pakistan', dial: '92' },
  { iso: 'PL', name: 'Poland', dial: '48' },
  { iso: 'PT', name: 'Portugal', dial: '351' },
  { iso: 'QA', name: 'Qatar', dial: '974' },
  { iso: 'RO', name: 'Romania', dial: '40' },
  { iso: 'RU', name: 'Russia', dial: '7' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966' },
  { iso: 'SE', name: 'Sweden', dial: '46' },
  { iso: 'SG', name: 'Singapore', dial: '65' },
  { iso: 'TH', name: 'Thailand', dial: '66' },
  { iso: 'TR', name: 'Turkey', dial: '90' },
  { iso: 'TW', name: 'Taiwan', dial: '886' },
  { iso: 'UA', name: 'Ukraine', dial: '380' },
  { iso: 'US', name: 'United States', dial: '1' },
  { iso: 'VN', name: 'Vietnam', dial: '84' },
  { iso: 'ZA', name: 'South Africa', dial: '27' },
]

/** Flag emoji from the two-letter code (regional-indicator symbols). */
export const flagOf = (iso: string) => String.fromCodePoint(...[...iso.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0)))

/** List labels like "+91 India" (search matches code or name); the closed button shows only "+91". */
export const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({
  value: c.iso,
  label: `+${c.dial} ${c.name}`,
  short: `+${c.dial}`,
  flag: c.iso,
}))

export const dialOf = (iso: string) => `+${COUNTRIES.find((c) => c.iso === iso)?.dial ?? '91'}`
