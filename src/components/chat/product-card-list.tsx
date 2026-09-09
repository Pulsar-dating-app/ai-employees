import { formatProductPrice, type ProductCard } from "@/lib/chat/product-cards";

// The products a reply recommended, rendered under its text.
//
// Rows inside the existing bubble, not cards inside the bubble: a bordered
// card nested in a bordered bubble is two containers doing one container's
// job, and at a phone's width the inner one has nowhere left to breathe.
// Hairlines separate the rows instead, so the whole reply still reads as
// one thing Malu said.
//
// Vertical, never a horizontal carousel. Three products fit a 390px screen
// as rows with a thumbnail big enough to actually recognise the product,
// where a carousel would crop the third and hide the price behind a swipe
// most customers never make.

function ProductRow({ product, locale }: { product: ProductCard; locale: string }) {
  const price = formatProductPrice(product.price, product.currency, locale);

  const body = (
    <>
      <div className="h-16 w-16 shrink-0 self-start overflow-hidden rounded-lg bg-surface-container">
        {product.imageUrl ? (
          // Deliberately a plain <img>, not next/image: these are arbitrary
          // merchant/Shopify CDN hosts that would each need a
          // remotePatterns entry, and an unconfigured host makes next/image
          // throw rather than fall back to the original URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-md font-medium text-on-surface">{product.name}</p>
        {product.description ? (
          // Already cut to MAX_CARD_DESCRIPTION_LENGTH with an ellipsis
          // server-side; the clamp is the narrow-screen backstop, where 120
          // characters still runs past two lines.
          <p className="mt-0.5 line-clamp-2 text-label-sm font-normal text-on-surface-variant">
            {product.description}
          </p>
        ) : null}
        {price ? <p className="mt-1 text-label-md font-medium text-on-surface">{price}</p> : null}
      </div>
    </>
  );

  if (!product.url) {
    return <div className="flex items-start gap-3 py-3">{body}</div>;
  }

  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {body}
    </a>
  );
}

export function ProductCardList({ products, locale }: { products: ProductCard[]; locale: string }) {
  if (products.length === 0) return null;

  return (
    <div className="mt-3 divide-y divide-outline-variant/50 border-t border-outline-variant/50 pt-1">
      {products.map((product) => (
        <ProductRow key={product.id} product={product} locale={locale} />
      ))}
    </div>
  );
}
