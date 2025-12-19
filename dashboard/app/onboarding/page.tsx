import { redirect } from "next/navigation";

export default function OnboardingPage(): JSX.Element {
  redirect("/sign-up");
}


