import { createFileRoute } from '@tanstack/react-router'
import { PRODUCT_PAGES } from '~/marketing/copy/products'
import { ProductPage } from '~/marketing/ProductPage'

export const Route = createFileRoute('/_site/inbound-agent')({
  component: () => <ProductPage copy={PRODUCT_PAGES.inbound} />,
})
