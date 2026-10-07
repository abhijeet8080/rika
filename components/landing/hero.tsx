import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowDown, Sparkles } from "lucide-react";
import { ProductPreview } from "./product-preview";
import { ScrollPreview } from "./scroll-preview";
import styles from "./landing.module.css";

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <div className={styles.heroLandscape} aria-hidden="true">
        <Image
          src="/images/rika-valley.png"
          alt=""
          fill
          sizes="100vw"
          preload
          className={styles.landscapeImage}
        />
      </div>
      <div className={styles.heroCopy}>
        <span className={styles.heroBadge}>
          <Sparkles size={13} /> A little less note-taking. A lot more presence.
        </span>
        <h1 id="hero-heading">
          Be present.
          <br />
          <span>Rika remembers.</span>
        </h1>
        <p>
          Your meetings, turned into clarity. Rika captures the conversation,
          <br className={styles.desktopBreak} /> keeps the important details,
          and finds the answers you need.
        </p>
        <div className={styles.heroActions}>
          <Link href="/sign-up" className={styles.primaryButton}>
            Get started free <ArrowRight size={17} />
          </Link>
          <a href="#product-preview" className={styles.secondaryButton}>
            Meet your new memory <ArrowDown size={16} />
          </a>
        </div>
        <p className={styles.heroFine}>
          For the conversation now. And the questions later.
        </p>
      </div>
      <div className={styles.previewWrap} id="product-preview">
        <ScrollPreview>
          <ProductPreview />
        </ScrollPreview>
        <p className={styles.previewCaption}>
          <span /> A glimpse of Rika · Interactive preview with sample meeting
          data
        </p>
      </div>
    </section>
  );
}
