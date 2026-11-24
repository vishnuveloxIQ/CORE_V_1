import type { PolicyData, PolicyKey } from '@/modules/core-data'

/**
 * Starting templates for the six built-in policies. A new company has no policy versions; it sets each one up from
 * its template, changes what it needs, and saves it as version 1. Nothing here is saved until the person saves it.
 *
 * The values are common starting points for an Indian construction company, not legal advice: every company should
 * check them against its own HR practice and the labour laws of its states.
 */
export function policyTemplate<K extends PolicyKey>(key: K, year = new Date().getFullYear()): PolicyData[K] {
  const templates: PolicyData = {
    shifts: {
      shiftsPerDay: 1,
      notes: 'One general shift. Add more shifts for sites that work in rotation.',
      weekOff: { type: 'Every Sunday' },
      timings: [{ name: 'General', start: '09:00', end: '18:00' }],
    },
    // Fixed-date national holidays only: festival dates change every year, so the company adds them for its calendar.
    holidays: {
      year,
      holidays: [
        { name: "New Year's Day", date: `${year}-01-01`, type: 'Optional' },
        { name: 'Republic Day', date: `${year}-01-26`, type: 'National' },
        { name: 'Labour Day', date: `${year}-05-01`, type: 'Optional' },
        { name: 'Independence Day', date: `${year}-08-15`, type: 'National' },
        { name: 'Gandhi Jayanti', date: `${year}-10-02`, type: 'National' },
        { name: 'Christmas', date: `${year}-12-25`, type: 'Optional' },
      ],
      variants: [],
    },
    overtime: {
      mode: 'Manual',
      weekdayRate: 1.5,
      holidayRate: 2,
      minMinutes: 30,
      dailyCapHours: 4,
      monthlyCapHours: 50,
      requiresApproval: true,
      enabled: true,
    },
    leave: {
      leaveTypes: [
        { name: 'Casual leave', code: 'CL', annualDays: 12, accrual: 'Monthly', carryForward: false, maxCarryDays: 0, expiryMonths: 0, encashable: false, paid: true },
        { name: 'Earned leave', code: 'EL', annualDays: 15, accrual: 'Monthly', carryForward: true, maxCarryDays: 30, expiryMonths: 0, encashable: true, paid: true },
        { name: 'Sick leave', code: 'SL', annualDays: 7, accrual: 'Yearly', carryForward: false, maxCarryDays: 0, expiryMonths: 0, encashable: false, paid: true },
      ],
      legalNote: 'Check these days against the Shops and Establishments Act and the Factories Act of each state where people work.',
    },
    'payment-threshold': { amount: 5_00_000, currency: 'INR' },
    rules: {
      rules: [
        { title: 'Safety gear on site', category: 'Safety', body: 'A helmet, safety shoes and a high-visibility vest are worn at all times in work zones.', ackRequired: false },
        { title: 'Attendance', category: 'Attendance', body: 'Attendance is marked at the start and end of each shift, inside the location geo-fence.', ackRequired: false },
        { title: 'Code of conduct', category: 'Conduct', body: 'Treat colleagues, clients and the communities around our sites with respect. Harassment of any kind is not tolerated.', ackRequired: false },
        { title: 'Company devices and data', category: 'IT', body: 'Company devices and data are for company work. Do not share passwords or install unapproved software.', ackRequired: false },
      ],
    },
  }
  return structuredClone(templates[key])
}
