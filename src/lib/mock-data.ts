export interface Imovel {
  id: string;
  bairro: string;
  areaMt2: number;
  precoTotal: number;
  precoPorMt2: number;
  link: string;
  quartos: number;
  tipo: string;
}

const bairros = [
  "Pinheiros", "Vila Mariana", "Moema", "Itaim Bibi", "Brooklin",
  "Consolação", "Jardins", "Perdizes", "Lapa", "Butantã",
  "Santana", "Tatuapé", "Vila Olímpia", "Campo Belo", "Saúde",
];

const tipos = ["Apartamento", "Studio", "Cobertura", "Casa", "Loft"];

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateMockData(count = 30): Imovel[] {
  return Array.from({ length: count }, (_, i) => {
    const area = randomBetween(25, 180);
    const precoBase = randomBetween(1500, 8000);
    const preco = Math.round(precoBase / 50) * 50;
    const quartos = area < 40 ? 1 : area < 70 ? randomBetween(1, 2) : randomBetween(2, 4);
    const bairro = bairros[randomBetween(0, bairros.length - 1)];
    const tipo = area < 35 ? "Studio" : tipos[randomBetween(0, tipos.length - 1)];
    const id = `qa-${100000 + i}`;

    return {
      id,
      bairro,
      areaMt2: area,
      precoTotal: preco,
      precoPorMt2: Math.round((preco / area) * 100) / 100,
      link: `https://www.quintoandar.com.br/imovel/${id}`,
      quartos,
      tipo,
    };
  });
}
