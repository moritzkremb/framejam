import lockup from "../../../../public/brand/lockup.svg";
import lockupLight from "../../../../public/brand/lockup-light.svg";

const SITE = "https://www.framejam.ai";

/** The FrameJam lockup, linking to the site: what a guest's header starts with instead of a back arrow. */
export function Logo() {
  return (
    <a href={SITE} className="fc-logo" aria-label="FrameJam" target="_blank" rel="noreferrer">
      <img className="on-dark" src={lockup} alt="" />
      <img className="on-light" src={lockupLight} alt="" />
    </a>
  );
}
