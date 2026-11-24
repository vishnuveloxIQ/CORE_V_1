import { forwardRef, type InputHTMLAttributes } from 'react'
import { COUNTRY_OPTIONS } from '@/shared/lib/countryCodes'
import { Input } from './Field'
import { SearchSelect } from './SearchSelect'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  /** two-letter country code, e.g. "IN" */
  country: string
  onCountry: (iso: string) => void
}

/** Mobile number: country selector (flag + dial code) beside a tel input. */
export const PhoneField = forwardRef<HTMLInputElement, Props>(function PhoneField({ country, onCountry, ...p }, ref) {
  return (
    <div className="phone-field">
      <SearchSelect ariaLabel="Country code" searchPlaceholder="Search country or code" options={COUNTRY_OPTIONS} value={country} placeholder="Code" onSelect={onCountry} />
      <Input ref={ref} type="tel" inputMode="tel" {...p} />
    </div>
  )
})
