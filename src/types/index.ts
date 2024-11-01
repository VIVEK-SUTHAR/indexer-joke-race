export interface FormResponse {
  timestamp: string;
  email_address: string;
  name: string;
  team_name: string;
  product_name: string;
  product_description: string;
  category: string;
  team_logo_image: string;
  speacker_headshot: string;
  eclipse_wallet_address: string;
  [key: string]: string;
}

export interface ErrorResponse {
  error: string;
}
