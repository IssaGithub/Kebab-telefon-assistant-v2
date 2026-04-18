variable "hcloud_token" {
  description = "Hetzner Cloud API token with write access."
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Prefix used for Hetzner resource names."
  type        = string
  default     = "kebab-telefon-assistant"
}

variable "location" {
  description = "Hetzner datacenter location, for example fsn1 or nbg1."
  type        = string
  default     = "fsn1"
}

variable "network_zone" {
  description = "Hetzner network zone for the private network."
  type        = string
  default     = "eu-central"
}

variable "network_ip_range" {
  description = "CIDR range for the private network."
  type        = string
  default     = "10.10.0.0/16"
}

variable "subnet_ip_range" {
  description = "CIDR range for the private subnet."
  type        = string
  default     = "10.10.1.0/24"
}

variable "app_server_type" {
  description = "Hetzner server type for app-01."
  type        = string
  default     = "ccx23"
}

variable "db_server_type" {
  description = "Hetzner server type for db-01."
  type        = string
  default     = "ccx13"
}

variable "server_image" {
  description = "Hetzner server image."
  type        = string
  default     = "ubuntu-24.04"
}

variable "ssh_public_keys" {
  description = "Public SSH keys to register in Hetzner Cloud and inject into both servers."
  type        = list(string)

  validation {
    condition     = length(var.ssh_public_keys) > 0
    error_message = "Provide at least one SSH public key."
  }
}

variable "admin_ingress_ipv4" {
  description = "IPv4 CIDRs allowed to SSH into the servers."
  type        = list(string)
  default     = []
}

variable "admin_ingress_ipv6" {
  description = "IPv6 CIDRs allowed to SSH into the servers."
  type        = list(string)
  default     = []
}

variable "enable_ipv6" {
  description = "Whether to enable public IPv6 on the servers."
  type        = bool
  default     = true
}

variable "app_private_ip" {
  description = "Static private IP for app-01."
  type        = string
  default     = "10.10.1.10"
}

variable "db_private_ip" {
  description = "Static private IP for db-01."
  type        = string
  default     = "10.10.1.20"
}

variable "deploy_user" {
  description = "Primary SSH user expected on the servers."
  type        = string
  default     = "root"
}

variable "repo_checkout_path" {
  description = "Path where the application repository will be checked out."
  type        = string
  default     = "/opt/kebab-telefon-assistant-v2"
}
