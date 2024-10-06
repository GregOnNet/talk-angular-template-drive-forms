import { AfterViewInit, DestroyRef, Directive, inject, input, output } from '@angular/core'
import {
  outputFromObservable,
  outputToObservable,
  takeUntilDestroyed
} from '@angular/core/rxjs-interop'
import { NgForm } from '@angular/forms'
import { BehaviorSubject, debounceTime, switchMap, tap } from 'rxjs'
import { BaseSchemaAsync, safeParseAsync } from 'valibot'

type InferSchema<TSchema = any> = TSchema extends BaseSchemaAsync<
  infer TInput,
  infer TOutput,
  infer TIssue
>
  ? BaseSchemaAsync<TInput, TOutput, TIssue>
  : never

@Directive({
  // Hook in to <form>-elements providing a setting-Attribute.
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'form',
  standalone: true
})
export class FormSettingDirective<TSchema> implements AfterViewInit {
  #destroyRef = inject(DestroyRef)
  ngForm = inject(NgForm, { self: true })

  schema = input.required<InferSchema<TSchema>>()

  safeSubmit = output<any>()
  valueChanged = outputFromObservable<any>(this.ngForm.valueChanges!.pipe(debounceTime(0)))

  errors$ = new BehaviorSubject<Record<string, { auto: string }> | null>(null)

  ngAfterViewInit(): void {
    this.validateFormValuesOnValueChange()
    this.emitSafeSubmitWhenValidationSucceeds()
  }

  private validateFormValuesOnValueChange() {
    outputToObservable(this.valueChanged)
      .pipe(
        tap(v => console.log(v)),
        switchMap(() => this.validate()),
        tap(result => this.errors$.next(result)),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe()
  }

  private emitSafeSubmitWhenValidationSucceeds() {
    this.ngForm.ngSubmit
      .pipe(
        switchMap(() => safeParseAsync(this.schema(), this.ngForm.value)),
        tap(result => (result.success ? this.safeSubmit.emit(result.output) : {})),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe()
  }

  private async validate(): Promise<Record<string, { auto: string }> | null> {
    const result = await safeParseAsync(this.schema(), this.ngForm.value)

    if (result.success) {
      return null
    }

    return result.issues.reduce((record, error) => {
      const path = error.path?.map((segment: any) => segment.key).join('.')

      if (!path) return record

      return Object.assign(record, { [path]: { auto: error.message } })
    }, {})
  }
}
