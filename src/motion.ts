export function reveal(element: HTMLElement | null) {
  if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;
  const animation = element.animate(
    [
      { opacity: 0.45, transform: "translateY(5px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" },
  );
  return () => animation.cancel();
}
