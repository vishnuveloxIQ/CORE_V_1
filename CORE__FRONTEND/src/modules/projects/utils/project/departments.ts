/** Departments a project can belong to. "Other" lets the user type the department's name. */
export const PROJECT_DEPARTMENTS = ['NHAI', 'NHIDCL', 'BRO', 'Irrigation', 'CPWD', 'PWD', 'State department'] as const
export const OTHER_DEPARTMENT = 'Other'

/** The dropdown choice that matches a saved department: a listed name, Other with the typed name, or blank. */
export function departmentChoiceOf(department: string | undefined): { choice: string; other: string } {
  if (!department) return { choice: '', other: '' }
  return (PROJECT_DEPARTMENTS as readonly string[]).includes(department)
    ? { choice: department, other: '' }
    : { choice: OTHER_DEPARTMENT, other: department }
}
