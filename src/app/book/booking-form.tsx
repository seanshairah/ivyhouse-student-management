"use client";

import * as React from "react";
import Link from "next/link";
import {
  useForm,
  type SubmitHandler,
  type Resolver,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Home as HomeIcon,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { bookingSchema, type BookingInput } from "@/lib/validators";
import { shake } from "@/lib/animation-config";
import { cn, formatCurrency } from "@/lib/utils";
import { submitApplicationAction } from "./actions";

export interface BookingRoom {
  id: string;
  number: string;
  name: string | null;
  type: string;
  floor: string | null;
  price: number;
  available: boolean;
}

export interface BookingHouse {
  id: string;
  name: string;
  slug: string;
  rooms: BookingRoom[];
}

const ROOM_TYPE_LABELS: Record<string, string> = {
  SINGLE: "Single",
  SHARED_DOUBLE: "Shared (Double)",
  SHARED_TRIPLE: "Shared (Triple)",
  ENSUITE: "En-suite",
  STUDIO: "Studio",
};

const STEPS = ["Personal", "Academic & Room", "Kin & Notes"];

// Fields validated per step (gate "Next" on these).
const STEP_FIELDS: (keyof BookingInput)[][] = [
  ["fullName", "email", "phone", "age"],
  ["institution", "houseId"],
  ["nextOfKinName", "nextOfKinPhone", "nextOfKinRelation", "agreedToTerms"],
];

export function BookingForm({
  houses,
  initialHouseId,
  initialRoomId,
}: {
  houses: BookingHouse[];
  initialHouseId: string;
  initialRoomId: string;
}) {
  const reduce = useReducedMotion();
  const [step, setStep] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [shakeKey, setShakeKey] = React.useState(0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    setError,
    formState: { errors },
  } = useForm<BookingInput>({
    resolver: zodResolver(bookingSchema) as Resolver<BookingInput>,
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      nationalId: "",
      gender: "",
      institution: "",
      program: "",
      yearOfStudy: "",
      houseId: initialHouseId,
      roomId: initialRoomId,
      nextOfKinName: "",
      nextOfKinPhone: "",
      nextOfKinRelation: "",
      guardianName: "",
      guardianPhone: "",
      specialNotes: "",
      medicalNeeds: "",
      agreedToTerms: false,
    },
  });

  const houseId = watch("houseId");
  const roomId = watch("roomId");
  const agreed = watch("agreedToTerms");

  const selectedHouse = houses.find((h) => h.id === houseId);
  const availableRooms = selectedHouse
    ? selectedHouse.rooms.filter((r) => r.available)
    : [];

  // When the house changes, clear a room that no longer belongs / isn't available.
  React.useEffect(() => {
    if (!roomId) return;
    const stillValid = availableRooms.some((r) => r.id === roomId);
    if (!stillValid) setValue("roomId", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseId]);

  const triggerShake = () => setShakeKey((k) => k + 1);

  async function next() {
    setFormError(null);
    const valid = await trigger(STEP_FIELDS[step]);
    if (!valid) {
      triggerShake();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setFormError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  const onValid: SubmitHandler<BookingInput> = async (values) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await submitApplicationAction(values);
      if (result.success && result.reference) {
        setSuccess(result.reference);
        return;
      }
      // Map field errors back onto the form if present.
      if (result.fieldErrors) {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof BookingInput, { message });
        }
      }
      setFormError(result.error ?? "Something went wrong. Please try again.");
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  };

  const onInvalid = (errs: FieldErrors<BookingInput>) => {
    // Jump to the earliest step containing an error.
    const firstStep = STEP_FIELDS.findIndex((fields) =>
      fields.some((f) => errs[f]),
    );
    if (firstStep >= 0) setStep(firstStep);
    triggerShake();
  };

  if (success) {
    return <SuccessState reference={success} reduce={!!reduce} />;
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <Stepper step={step} />

      <form onSubmit={handleSubmit(onValid, onInvalid)} className="mt-8" noValidate>
        <motion.div
          key={`shake-${shakeKey}`}
          variants={shake}
          animate={shakeKey ? "shake" : undefined}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 0 && (
                <StepPersonal register={register} errors={errors} />
              )}
              {step === 1 && (
                <StepAcademic
                  register={register}
                  errors={errors}
                  houses={houses}
                  houseId={houseId}
                  roomId={roomId}
                  availableRooms={availableRooms}
                  onSelectRoom={(id) =>
                    setValue("roomId", id, { shouldValidate: false })
                  }
                  reduce={!!reduce}
                />
              )}
              {step === 2 && (
                <StepKin
                  register={register}
                  errors={errors}
                  agreed={agreed}
                  onAgreeChange={(v) =>
                    setValue("agreedToTerms", v, { shouldValidate: true })
                  }
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {formError && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Nav buttons */}
        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={back}
              disabled={submitting}
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
          ) : (
            <Button asChild variant="ghost">
              <Link href="/houses">Cancel</Link>
            </Button>
          )}

          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              className="rounded-full"
              onClick={next}
            >
              Continue
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              className="rounded-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  Submit application
                  <Check className="size-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ─────────────────────────── Stepper ─────────────────────────── */

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
                  done && "bg-primary text-primary-foreground",
                  active && "bg-primary text-primary-foreground ring-4 ring-brand-100",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-semibold sm:block",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1 transition-colors",
                  i < step ? "bg-foreground" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────────────────── Field helper ─────────────────────────── */

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────── Step 1: Personal ─────────────────────────── */

type RegisterFn = ReturnType<typeof useForm<BookingInput>>["register"];

function StepPersonal({
  register,
  errors,
}: {
  register: RegisterFn;
  errors: FieldErrors<BookingInput>;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Personal details</h2>
        <p className="text-sm text-muted-foreground">
          Tell us who you are so we can get in touch.
        </p>
      </div>

      <Field
        label="Full name"
        htmlFor="fullName"
        required
        error={errors.fullName?.message}
      >
        <Input id="fullName" placeholder="Jane Doe" {...register("fullName")} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Email"
          htmlFor="email"
          required
          error={errors.email?.message}
        >
          <Input
            id="email"
            type="email"
            placeholder="jane@example.com"
            {...register("email")}
          />
        </Field>
        <Field
          label="Phone"
          htmlFor="phone"
          required
          error={errors.phone?.message}
        >
          <Input id="phone" placeholder="+000 000 0000" {...register("phone")} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label="National ID"
          htmlFor="nationalId"
          error={errors.nationalId?.message}
        >
          <Input id="nationalId" {...register("nationalId")} />
        </Field>
        <Field label="Age" htmlFor="age" error={errors.age?.message}>
          <Input
            id="age"
            type="number"
            min={16}
            max={80}
            placeholder="19"
            {...register("age")}
          />
        </Field>
        <Field label="Gender" htmlFor="gender" error={errors.gender?.message}>
          <Select id="gender" {...register("gender")}>
            <option value="">Prefer not to say</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}

/* ─────────────────────────── Step 2: Academic & Room ─────────────────────────── */

function StepAcademic({
  register,
  errors,
  houses,
  houseId,
  roomId,
  availableRooms,
  onSelectRoom,
  reduce,
}: {
  register: RegisterFn;
  errors: FieldErrors<BookingInput>;
  houses: BookingHouse[];
  houseId: string;
  roomId: string | undefined;
  availableRooms: BookingRoom[];
  onSelectRoom: (id: string) => void;
  reduce: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold">
          Academic &amp; room
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick your house and an available room.
        </p>
      </div>

      <Field
        label="Institution"
        htmlFor="institution"
        required
        error={errors.institution?.message}
      >
        <Input
          id="institution"
          placeholder="University of …"
          {...register("institution")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Programme"
          htmlFor="program"
          error={errors.program?.message}
        >
          <Input
            id="program"
            placeholder="BSc Computer Science"
            {...register("program")}
          />
        </Field>
        <Field
          label="Year of study"
          htmlFor="yearOfStudy"
          error={errors.yearOfStudy?.message}
        >
          <Select id="yearOfStudy" {...register("yearOfStudy")}>
            <option value="">Select</option>
            <option value="1">Year 1</option>
            <option value="2">Year 2</option>
            <option value="3">Year 3</option>
            <option value="4">Year 4</option>
            <option value="5+">Year 5+</option>
            <option value="Postgraduate">Postgraduate</option>
          </Select>
        </Field>
      </div>

      <Field
        label="House"
        htmlFor="houseId"
        required
        error={errors.houseId?.message}
      >
        <Select id="houseId" {...register("houseId")}>
          <option value="">Choose a house</option>
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </Field>

      {/* Room picker */}
      <div className="space-y-2">
        <Label>
          Room <span className="text-xs font-normal text-muted-foreground">(optional — we can assign one)</span>
        </Label>

        {!houseId ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Select a house to see available rooms.
          </p>
        ) : availableRooms.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No rooms are currently available in this house. You can still apply
            and we&apos;ll assign a room, or choose another house.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {availableRooms.map((room) => {
              const selected = roomId === room.id;
              return (
                <motion.button
                  key={room.id}
                  type="button"
                  onClick={() => onSelectRoom(selected ? "" : room.id)}
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  animate={
                    reduce ? undefined : { scale: selected ? 1.02 : 1 }
                  }
                  transition={{ duration: 0.18 }}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-colors",
                    selected
                      ? "border-foreground bg-brand-50 ring-1 ring-foreground"
                      : "border-border bg-card hover:border-brand-400",
                  )}
                >
                  <div>
                    <p className="font-semibold">Room {room.number}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROOM_TYPE_LABELS[room.type] ?? room.type}
                      {room.floor ? ` · ${room.floor} floor` : ""}
                    </p>
                    <p className="mt-1 font-display text-base font-bold">
                      {formatCurrency(room.price)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        / mo
                      </span>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border transition-colors",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-transparent",
                    )}
                  >
                    <Check className="size-3.5" />
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
        {/* Hidden registered field keeps roomId in form state */}
        <input type="hidden" {...register("roomId")} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Step 3: Kin & Notes ─────────────────────────── */

function StepKin({
  register,
  errors,
  agreed,
  onAgreeChange,
}: {
  register: RegisterFn;
  errors: FieldErrors<BookingInput>;
  agreed: boolean;
  onAgreeChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold">
          Next of kin &amp; notes
        </h2>
        <p className="text-sm text-muted-foreground">
          An emergency contact and anything else we should know.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Next of kin name"
          htmlFor="nextOfKinName"
          required
          error={errors.nextOfKinName?.message}
        >
          <Input id="nextOfKinName" {...register("nextOfKinName")} />
        </Field>
        <Field
          label="Next of kin phone"
          htmlFor="nextOfKinPhone"
          required
          error={errors.nextOfKinPhone?.message}
        >
          <Input id="nextOfKinPhone" {...register("nextOfKinPhone")} />
        </Field>
      </div>

      <Field
        label="Relationship"
        htmlFor="nextOfKinRelation"
        required
        error={errors.nextOfKinRelation?.message}
      >
        <Input
          id="nextOfKinRelation"
          placeholder="Parent, sibling, guardian…"
          {...register("nextOfKinRelation")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Guardian name"
          htmlFor="guardianName"
          error={errors.guardianName?.message}
        >
          <Input id="guardianName" {...register("guardianName")} />
        </Field>
        <Field
          label="Guardian phone"
          htmlFor="guardianPhone"
          error={errors.guardianPhone?.message}
        >
          <Input id="guardianPhone" {...register("guardianPhone")} />
        </Field>
      </div>

      <Field
        label="Special notes"
        htmlFor="specialNotes"
        error={errors.specialNotes?.message}
        hint="Roommate preferences, accessibility needs, etc."
      >
        <Textarea
          id="specialNotes"
          rows={3}
          {...register("specialNotes")}
        />
      </Field>

      <Field
        label="Medical needs"
        htmlFor="medicalNeeds"
        error={errors.medicalNeeds?.message}
        hint="Anything our caretakers should be aware of (optional)."
      >
        <Textarea id="medicalNeeds" rows={2} {...register("medicalNeeds")} />
      </Field>

      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl border p-4",
          errors.agreedToTerms
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-muted/30",
        )}
      >
        <Checkbox
          id="agreedToTerms"
          checked={agreed}
          onCheckedChange={(v) => onAgreeChange(v === true)}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <Label htmlFor="agreedToTerms" className="cursor-pointer font-medium">
            I agree to the house rules and terms
          </Label>
          <p className="text-xs text-muted-foreground">
            By submitting, you confirm the details are accurate and accept the
            residence rules and application terms.
          </p>
          {errors.agreedToTerms && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="size-3" />
              {errors.agreedToTerms.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Success ─────────────────────────── */

function SuccessState({
  reference,
  reduce,
}: {
  reference: string;
  reduce: boolean;
}) {
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-12"
    >
      <motion.span
        initial={reduce ? { opacity: 0 } : { scale: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 14,
          delay: 0.1,
        }}
        className="mx-auto grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"
      >
        <CheckCircle2 className="size-9" />
      </motion.span>

      <h2 className="mt-6 font-display text-2xl font-bold tracking-tight">
        Application submitted!
      </h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        Thanks for applying. We&apos;ll review your application within 1–2 days
        and email you next steps. Your room is held while we review.
      </p>

      <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-2xl border border-border bg-muted/40 px-6 py-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your reference
        </span>
        <span className="mt-1 font-display text-xl font-bold">
          {reference}
        </span>
      </div>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild className="rounded-full">
          <Link href="/auth/login">
            Go to login
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/">
            <HomeIcon className="size-4" />
            Back home
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
