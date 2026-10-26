import Image from "next/image";

/** The same supplied flower asset used in the main Arize app, not an emoji. */
export default function StudentBrand() {
  return (
    <>
      <Image
        className="student-brand-image"
        src="/flower%20nobg.png"
        width={48}
        height={44}
        alt=""
        unoptimized
      />
      <span>
        Arize<span className="student-edition-label">Student Edition</span>
      </span>
    </>
  );
}
