import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../../stores/auth';
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  FormError,
  FormRow,
  Input,
} from '../../components/ui';

const schema = z.object({
  organizationName: z.string().min(1, 'Company name is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid work email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .max(128, 'Too long'),
  website: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^https?:\/\//i.test(v),
      'Website should start with http:// or https://',
    ),
});

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const registerUser = useAuthStore((s) => s.register);
  const storeError = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      organizationName: '',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      website: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerUser({
        ...values,
        website: values.website?.trim() || undefined,
      });
      navigate('/onboarding');
    } catch {
      /* shown via store error */
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-app">
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold">
            C
          </div>
          <span className="text-xl font-semibold tracking-tight text-text-primary">
            CloserAI
          </span>
        </div>
        <h1 className="text-2xl font-semibold mb-2 text-text-primary">
          Start your free trial
        </h1>
        <p className="text-sm text-text-muted mb-6">14 days, no credit card required.</p>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field>
            <FieldLabel htmlFor="organizationName">Company name</FieldLabel>
            <Input
              id="organizationName"
              aria-invalid={errors.organizationName ? 'true' : 'false'}
              {...register('organizationName')}
            />
            <FieldError>{errors.organizationName?.message}</FieldError>
          </Field>
          <FormRow>
            <Field>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input
                id="firstName"
                autoComplete="given-name"
                aria-invalid={errors.firstName ? 'true' : 'false'}
                {...register('firstName')}
              />
              <FieldError>{errors.firstName?.message}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input
                id="lastName"
                autoComplete="family-name"
                aria-invalid={errors.lastName ? 'true' : 'false'}
                {...register('lastName')}
              />
              <FieldError>{errors.lastName?.message}</FieldError>
            </Field>
          </FormRow>
          <Field>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? 'true' : 'false'}
              {...register('email')}
            />
            <FieldError>{errors.email?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? 'true' : 'false'}
              {...register('password')}
            />
            <FieldError>{errors.password?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="website">Company website (optional)</FieldLabel>
            <Input
              id="website"
              type="url"
              placeholder="https://..."
              aria-invalid={errors.website ? 'true' : 'false'}
              {...register('website')}
            />
            <FieldError>{errors.website?.message}</FieldError>
          </Field>
          <FormError>{storeError}</FormError>
          <Button
            type="submit"
            className="w-full justify-center"
            size="lg"
            loading={isSubmitting}
            disabled={!isValid || isSubmitting}
          >
            Create workspace
          </Button>
        </form>
        <p className="text-sm text-text-muted mt-6 text-center">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-brand-600 dark:text-brand-300 font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
