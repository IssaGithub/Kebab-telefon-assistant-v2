# Hetzner Terraform

This directory provisions the minimum production infrastructure for this repository on Hetzner Cloud:

- `app-01`
- `db-01`
- one private network
- one app firewall
- one DB firewall
- SSH key registration
- cloud-init bootstrap for Docker and basic host hardening

## Cost and Tooling

Terraform CLI is free to use locally. Terraform Cloud is optional and not required here.

If you prefer a fully open-source CLI, this configuration should also work with OpenTofu with little or no change.

## What It Creates

- `app-01`
  - public IPv4
  - optional public IPv6
  - private IP on the Hetzner network
  - firewall allowing `22`, `80`, and `443`
  - cloud-init installs Docker Engine, Compose plugin, Git, and UFW
- `db-01`
  - public IPv4 for admin SSH only
  - private IP on the Hetzner network
  - firewall allowing `22` from admin IPs and `5432`/`6379` only from `app-01`
  - cloud-init installs Docker Engine, Compose plugin, Git, and UFW

## Inputs

Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in:

- `hcloud_token`
- `ssh_public_keys`
- `admin_ingress_ipv4`
- optionally `admin_ingress_ipv6`
- `location`

## Usage

1. Install Terraform or OpenTofu.
2. Create `terraform.tfvars` from the example.
3. Run:

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

## Outputs

After apply, Terraform prints:

- public IPs
- private IPs
- private network ID

Use the `app-01` public IPs for DNS and the `db-01` private IP in your production `.env`.

## Bootstrap Behavior

The servers are bootstrapped with cloud-init templates in `templates/`:

- install Docker Engine and Docker Compose plugin
- install Git and basic support packages
- enable UFW with a minimal rule set
- create the repository checkout directory

Application secrets, repository checkout, GHCR login, and Compose deployment are still explicit manual steps.

## Notes

- This is intentionally minimal. It does not yet provision DNS, load balancers, snapshots, or object storage.
- `db-01` still has a public IPv4 because Hetzner servers are created with public networking here for SSH access. The firewall restricts access to SSH from your admin IPs only.
- If you want to remove public networking from `db-01` later, do that only after you have another secure management path.
- The DB cloud-init template currently allows `5432` and `6379` from `10.10.1.10`, which should match `app_private_ip`. Keep those values aligned.
