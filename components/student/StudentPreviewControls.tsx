export default function StudentPreviewControls({
  screen,
  device,
  state,
}: {
  screen: string;
  device: string;
  state: string;
}) {
  function path(values: { screen?: string; device?: string; state?: string }) {
    const query = new URLSearchParams({
      screen: values.screen ?? screen,
      device: values.device ?? device,
      state: values.state ?? state,
    });
    return `/student-design?${query}`;
  }
  return (
    <header
      className="student-preview-controls"
      aria-label="Design preview controls"
    >
      <div>
        <strong>Arize Student Edition</strong>
        <p>Interactive mockups · Sample data only</p>
      </div>
      <nav aria-label="Preview device">
        {[
          ["desktop", "Desktop"],
          ["phone", "Phone"],
          ["chromebook", "Chromebook"],
        ].map(([value, label]) => (
          <a
            key={value}
            href={path({ device: value })}
            aria-current={device === value ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <nav aria-label="Preview screen">
        {[
          ["home", "Home"],
          ["goals", "Goals"],
          ["clarity", "Clarity"],
          ["counselor", "Counselor"],
          ["toolkit", "Toolkit"],
          ["class-reset", "Class Reset"],
          ["profile", "Profile"],
        ].map(([value, label]) => (
          <a
            key={value}
            href={path({ screen: value, state: "default" })}
            aria-current={screen === value ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <nav aria-label="Preview state">
        {[
          ["default", "Returning student"],
          ["first-use", "First visit"],
          ["loading", "Loading"],
          ["onboarding", "Onboarding"],
        ].map(([value, label]) => (
          <a
            key={value}
            href={path({ state: value })}
            aria-current={state === value ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <nav aria-label="Staff preview">
        <a
          href="/student-design?screen=admin-notifications"
          aria-current={screen === "admin-notifications" ? "page" : undefined}
        >
          Admin settings
        </a>
      </nav>
    </header>
  );
}
