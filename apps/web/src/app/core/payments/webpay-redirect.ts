/**
 * Webpay no acepta que se lo abra con un GET: espera un POST con el `token_ws`
 * en el cuerpo. Como no hay forma de hacer un POST navegando, se arma un
 * formulario en el aire y se envía; el navegador se va a Webpay con el método
 * correcto y el cliente vuelve después al retorno que configuró la API.
 */
export function postToWebpay(url: string, token: string, document: Document): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'token_ws';
  input.value = token;

  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}
