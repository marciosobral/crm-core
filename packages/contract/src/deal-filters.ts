import { Schema, SchemaGetter } from "effect"
import { CalendarDate } from "./dates.ts"
import { DealStatus } from "./deal-status.ts"
import { trimmedText } from "./text.ts"

const valueCents = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99_999_999_999 }))
const idleDays = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 365 }))
const statuses = Schema.NonEmptyArray(DealStatus).check(Schema.isUnique())

const DealFilterFields = Schema.Struct({
  statuses: Schema.optionalKey(statuses),
  minValueCents: Schema.optionalKey(valueCents),
  maxValueCents: Schema.optionalKey(valueCents),
  idleDays: Schema.optionalKey(idleDays),
  closeFrom: Schema.optionalKey(CalendarDate),
  closeTo: Schema.optionalKey(CalendarDate),
  closedFrom: Schema.optionalKey(CalendarDate),
  closedTo: Schema.optionalKey(CalendarDate),
  search: Schema.optionalKey(trimmedText(100)),
  sellerId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
})

const isNotInverted = <T extends string | number>(start: T | undefined, end: T | undefined) =>
  start === undefined || end === undefined || start <= end

const rangesAreNotInverted = Schema.makeFilter<typeof DealFilterFields.Type>(
  (filters) =>
    isNotInverted(filters.minValueCents, filters.maxValueCents) &&
    isNotInverted(filters.closeFrom, filters.closeTo) &&
    isNotInverted(filters.closedFrom, filters.closedTo),
  { title: "ranges must not be inverted" },
)

export const DealFilters = DealFilterFields.check(rangesAreNotInverted)
export type DealFilters = typeof DealFilters.Type

const numberFromString = <S extends Schema.Constraint>(field: S) =>
  Schema.String.check(Schema.isPattern(/^\d+$/)).pipe(
    Schema.decodeTo(Schema.FiniteFromString),
    Schema.decodeTo(field),
  )

const statusesFromString = Schema.String.pipe(
  Schema.decodeTo(Schema.Array(Schema.String), {
    decode: SchemaGetter.split(),
    encode: SchemaGetter.transform((values) => values.join(",")),
  }),
  Schema.decodeTo(statuses),
)

export const ListDealsQuery = Schema.Struct({
  ...DealFilterFields.fields,
  statuses: Schema.optionalKey(statusesFromString),
  minValueCents: Schema.optionalKey(numberFromString(valueCents)),
  maxValueCents: Schema.optionalKey(numberFromString(valueCents)),
  idleDays: Schema.optionalKey(numberFromString(idleDays)),
}).check(rangesAreNotInverted)
